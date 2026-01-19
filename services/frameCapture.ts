/**
 * Frame Capture Service
 *
 * Handles periodic camera frame capture and analysis for guided fix sessions.
 * Integrates with the state machine to ensure frames are only processed in valid states.
 *
 * IMPORTANT: Uses getter functions instead of direct values to avoid stale closure bugs.
 * When state/context change in React, the getters always return current values.
 */

import { CameraView } from 'expo-camera';
import { GuidedFixState, GuidedFixAction, GuidedFixContext } from '../hooks/useGuidedFixStateMachine';
import { getRealTimeGuidance, RepairStep, GuidanceResponse } from './guidedFix';

export interface FrameCaptureConfig {
  intervalMs: number; // How often to capture frames (default: 2000ms)
  quality: number; // JPEG quality (default: 0.5)
  minTimeBetweenAnalyses: number; // Minimum ms between API calls (default: 1500ms)
}

const DEFAULT_CONFIG: FrameCaptureConfig = {
  intervalMs: 2000,
  quality: 0.5,
  minTimeBetweenAnalyses: 1500,
};

// Getter functions that always return current values (avoids stale closures)
export interface FrameCaptureGetters {
  getState: () => GuidedFixState;
  getContext: () => GuidedFixContext;
  dispatch: (action: GuidedFixAction) => void;
  isSpeaking: () => boolean;
}

export class FrameCaptureService {
  private intervalId: NodeJS.Timeout | null = null;
  private cameraRef: React.RefObject<CameraView | null> | null = null;
  private config: FrameCaptureConfig;
  private lastAnalysisTime: number = 0;
  private isAnalyzing: boolean = false;
  private getters: FrameCaptureGetters | null = null;

  constructor(config: Partial<FrameCaptureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start periodic frame capture
   *
   * Uses getter functions to always access current state/context values,
   * preventing stale closure bugs where old values would be captured.
   */
  start(
    cameraRef: React.RefObject<CameraView | null>,
    getters: FrameCaptureGetters
  ) {
    if (this.intervalId) {
      return; // Already running
    }

    this.cameraRef = cameraRef;
    this.getters = getters;
    console.log(`📹 Starting frame capture (${this.config.intervalMs}ms interval)`);

    // Capture first frame immediately, then on interval
    this.captureAndAnalyze();

    this.intervalId = setInterval(async () => {
      await this.captureAndAnalyze();
    }, this.config.intervalMs);
  }

  /**
   * Stop frame capture
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Frame capture stopped');
    }
  }

  /**
   * Check if frame capture should run based on current state
   */
  private shouldCapture(): boolean {
    if (!this.getters) {
      console.log('⏸️ Skipping frame: getters not set');
      return false;
    }

    const state = this.getters.getState();
    const isSpeaking = this.getters.isSpeaking;

    // Only capture in active states (including identity verification)
    // Note: CONFIRMING_COMPLETION no longer used - completion modal shows immediately
    if (state.type !== 'STEP_ACTIVE' && state.type !== 'VERIFYING_IDENTITY') {
      console.log('⏸️ Skipping frame: state is', state.type);
      return false;
    }

    // Don't capture if already analyzing
    if (this.isAnalyzing) {
      console.log('⏸️ Skipping frame: analysis in progress');
      return false;
    }

    // Don't capture while speaking
    if (isSpeaking()) {
      console.log('⏸️ Skipping frame: speech in progress');
      return false;
    }

    // Enforce minimum time between analyses
    const timeSinceLastAnalysis = Date.now() - this.lastAnalysisTime;
    if (timeSinceLastAnalysis < this.config.minTimeBetweenAnalyses) {
      console.log(`⏸️ Skipping frame: only ${timeSinceLastAnalysis}ms since last analysis`);
      return false;
    }

    // Camera must be ready
    if (!this.cameraRef?.current) {
      console.log('⏸️ Skipping frame: camera not ready');
      return false;
    }

    return true;
  }

  /**
   * Capture a frame and send it for analysis
   *
   * Gets fresh state/context via getters to avoid stale closure issues
   */
  private async captureAndAnalyze() {
    if (!this.shouldCapture()) {
      return;
    }

    // Get current values via getters (avoids stale closures)
    const state = this.getters!.getState();
    const context = this.getters!.getContext();
    const dispatch = this.getters!.dispatch;

    // Handle identity verification separately
    const isVerifyingIdentity = state.type === 'VERIFYING_IDENTITY';

    // Get current step info (use step 0 during identity verification)
    const currentStepIndex = state.type === 'STEP_ACTIVE' || state.type === 'CONFIRMING_COMPLETION'
      ? state.step
      : 0;

    const currentStep = context.repairSteps[currentStepIndex];
    // During identity verification, we may not have steps yet - that's OK
    if (!currentStep && !isVerifyingIdentity) {
      console.error('❌ No current step found');
      return;
    }

    const requestId = state.type === 'STEP_ACTIVE'
      ? state.requestId
      : state.type === 'VERIFYING_IDENTITY'
        ? state.requestId
        : `req_${context.nextRequestId}`;

    console.log(`📸 Capturing frame for step ${currentStepIndex + 1}, requestId: ${requestId}`);

    try {
      this.isAnalyzing = true;

      // Create abort controller for this request
      const abortController = new AbortController();
      context.currentAbortController = abortController;

      // Capture photo - with error handling for camera not ready
      let photo;
      try {
        photo = await this.cameraRef!.current!.takePictureAsync({
          base64: true,
          quality: this.config.quality,
        });
      } catch (captureError: any) {
        // Camera might not be ready - this is common on first few frames
        console.log('📷 Camera capture failed (may still be initializing):', captureError?.message || captureError);
        return;
      }

      if (!photo || !photo.base64) {
        console.log('📷 No photo data returned (camera may still be initializing)');
        return;
      }

      const frameBase64 = photo.base64;

      // Build guidance request with context (matches GuidanceRequest interface)
      // During identity verification, use expectedItem as the problem description
      const guidanceRequest = {
        imageBase64: frameBase64,
        category: 'general', // TODO: pass from route params
        problemDescription: isVerifyingIdentity
          ? `Identify the item in view. Expected item: ${context.expectedItem}`
          : (currentStep?.instruction || ''),
        currentStep: isVerifyingIdentity ? 0 : currentStepIndex + 1,
        totalSteps: context.repairSteps.length || 1,
        currentStepInstruction: isVerifyingIdentity
          ? `Look for and identify: ${context.expectedItem}`
          : (currentStep?.instruction || ''),
        stepContext: isVerifyingIdentity
          ? `Verifying user has the correct item: ${context.expectedItem}`
          : (currentStep?.lookingFor || ''),
        completionCriteria: currentStep?.completionCriteria,
        visualAnchors: currentStep?.visualAnchors,

        // Pass expected item for identity verification
        expectedItem: context.expectedItem || '',

        // Include substitution constraints (TACTICAL FIX #4)
        bannedItems: Array.from(context.permanentlyUnavailableItems),
        confirmedSubstitutes: Object.fromEntries(context.confirmedSubstitutes),
      };

      // Call guidance API with detailed logging
      console.log(isVerifyingIdentity
        ? `🔍 Sending identity verification request for: ${context.expectedItem}`
        : `🌐 Sending guidance request for step ${currentStepIndex + 1}/${context.repairSteps.length}: "${currentStep?.instruction?.substring(0, 50)}..."`);
      const guidance = await getRealTimeGuidance(guidanceRequest);

      this.lastAnalysisTime = Date.now();

      // Get CURRENT state after API call to validate response (avoids stale closure)
      const currentState = this.getters!.getState();
      const currentContext = this.getters!.getContext();

      // Validate response is for current state (STALE RESPONSE GATING)
      if (currentState.type === 'STEP_ACTIVE') {
        if (currentState.requestId !== requestId) {
          console.log(`🚫 IGNORING stale response: requestId mismatch (expected ${currentState.requestId}, got ${requestId})`);
          return;
        }
        if (currentState.step !== currentStepIndex) {
          console.log(`🚫 IGNORING stale response: step mismatch (expected ${currentState.step}, got ${currentStepIndex})`);
          return;
        }
      }

      // Also validate for VERIFYING_IDENTITY state
      if (currentState.type === 'VERIFYING_IDENTITY') {
        if (currentState.requestId !== requestId) {
          console.log(`🚫 IGNORING stale response: requestId mismatch during identity verification`);
          return;
        }
      }

      // If state changed completely, ignore the response
      if (currentState.type !== state.type) {
        console.log(`🚫 IGNORING stale response: state changed from ${state.type} to ${currentState.type}`);
        return;
      }

      console.log('✅ Guidance received:', {
        requestId,
        instruction: guidance.instruction?.substring(0, 50),
        confidence: guidance.confidence,
        stepComplete: guidance.stepComplete,
        highlightsCount: guidance.highlights?.length || 0,
        detectedObject: guidance.detectedObject,
      });

      // Dispatch appropriate actions based on guidance (use current state/context)
      this.processGuidance(guidance, requestId, currentState, currentContext, dispatch);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🚫 Request aborted (state changed)');
        return;
      }

      console.error('❌ Frame analysis error:', error);

      // Check for rate limiting
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
        console.log('⏳ Rate limited, slowing down capture...');
        // Could dispatch a rate limit action here
      }
    } finally {
      this.isAnalyzing = false;
      // Clear abort controller on current context (get fresh reference)
      if (this.getters) {
        this.getters.getContext().currentAbortController = null;
      }
    }
  }

  /**
   * Process guidance response and dispatch appropriate actions
   */
  private processGuidance(
    guidance: GuidanceResponse,
    requestId: string,
    state: GuidedFixState,
    context: GuidedFixContext,
    dispatch: (action: GuidedFixAction) => void
  ) {
    // Store guidance in context
    context.currentGuidance = guidance.instruction || '';
    context.currentHighlights = guidance.highlights || [];

    // Handle identity verification state
    if (state.type === 'VERIFYING_IDENTITY') {
      // Check if guidance includes detected object for identity verification
      if (guidance.detectedObject) {
        console.log('🔍 Identity check - detected:', guidance.detectedObject, 'expected:', context.expectedItem);
        dispatch({
          type: 'IDENTITY_DETECTED',
          item: guidance.detectedObject,
          expectedItem: context.expectedItem,
          requestId: state.requestId,
        });
      }
      return; // Don't process other actions during identity verification
    }

    // Dispatch frame analyzed event
    dispatch({ type: 'FRAME_ANALYZED', guidance, requestId });

    // Check for low confidence (TACTICAL FIX #3 - Escalation ladder)
    if (guidance.confidence < 0.3) {
      dispatch({ type: 'LOW_CONFIDENCE_FRAME' });
    }

    // Check for safety warnings
    if (guidance.safetyWarning) {
      console.warn('⚠️ SAFETY WARNING:', guidance.safetyWarning);
      // Could dispatch a safety warning action here
    }

    // ALWAYS pause after receiving guidance to give user control
    // This creates a consistent flow: AI instruction -> User acknowledges -> Continue
    if (guidance.stepComplete && guidance.confidence >= 0.7) {
      // Step is complete - show completion confirmation
      const evidence = guidance.completionEvidence || 'Step appears complete';
      dispatch({
        type: 'STEP_COMPLETION_DETECTED',
        evidence,
        requestId,
        confidence: guidance.confidence,
      });
    } else if (guidance.instruction) {
      // Step not complete - pause to show instruction and let user interact
      // User can: Repeat instruction, Ask question, or confirm "Got it!"
      dispatch({
        type: 'PAUSE_FOR_TASK',
        instruction: guidance.instruction,
      });
    }
  }

  /**
   * Get current analysis status
   */
  isCurrentlyAnalyzing(): boolean {
    return this.isAnalyzing;
  }
}

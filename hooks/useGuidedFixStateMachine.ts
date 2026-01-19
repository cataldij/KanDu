/**
 * State Machine for Guided Fix Session
 *
 * COMPLETE VERSION with all states for full feature parity with old UI.
 * This replaces the 40+ useState variables with a single, predictable state machine
 * that prevents invalid states and race conditions.
 */

import { useReducer, useRef, useEffect } from 'react';
import { RepairStep, GuidanceResponse, BoundingBox } from '../services/guidedFix';

// ============================================================================
// TYPES
// ============================================================================

export type PauseReason = 'manual' | 'get_item' | 'working_on_step' | 'do_task';

export type StepStatus = 'IN_PROGRESS' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'OVERRIDDEN';

export type IdentityStatus = 'UNKNOWN' | 'VERIFYING' | 'CONFIRMED' | 'MISMATCH';

export interface SubstituteInfo {
  item: string;
  reason: string;
  instruction?: string;
  confidence: number;
  highlight?: BoundingBox;
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface VoiceSettings {
  rate: number;
  pitch: number;
  voiceIdentifier?: string;
  voiceName: string;
}

// ============================================================================
// STATE TYPES
// ============================================================================

export type GuidedFixState =
  // Initial States
  | { type: 'IDLE' }
  | { type: 'LOADING_PLAN' }
  | { type: 'REQUESTING_PERMISSIONS' }

  // Identity Verification
  | {
      type: 'VERIFYING_IDENTITY';
      detectedItem: string;
      expectedItem: string;
      mismatchCount: number;
      requestId: string;
    }
  | {
      type: 'IDENTITY_MISMATCH_MODAL';
      detectedItem: string;
      expectedItem: string;
    }

  // Step Execution
  | {
      type: 'STEP_ACTIVE';
      step: number;
      stepStatus: StepStatus;
      isWorkingMode: boolean;
      requestId: string;
      startTime: number;
      lastGuidanceTime: number;
      workingModeStartTime?: number;
    }
  | {
      type: 'CONFIRMING_COMPLETION';
      step: number;
      evidence: string;
      confirmationCount: number;
      requestId: string;
    }
  | {
      type: 'COMPLETION_SUGGESTED_MODAL';
      step: number;
      evidence: string;
    }
  | {
      type: 'OVERRIDE_CONFIRMATION_MODAL';
      step: number;
      instruction: string;
    }

  // Pause States
  | {
      type: 'PAUSED';
      step: number;
      reason: PauseReason;
      neededItems: string[];
      missingItems: Set<string>;
      workingStepDescription?: string;
      taskInstruction?: string;
      pauseMessage?: string;
    }

  // Voice Question States
  | {
      type: 'LISTENING';
      step: number;
      transcription: string;
    }
  | {
      type: 'PROCESSING_QUESTION';
      step: number;
      question: string;
    }
  | {
      type: 'SHOWING_ANSWER';
      step: number;
      question: string;
      answer: string;
    }
  | {
      type: 'CONVERSATION';
      step: number;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    }

  // Substitute Search States
  | {
      type: 'SUBSTITUTE_SCAN_READY';
      step: number;
      searchItem: string;
      remainingMissingItems: string[];
    }
  | {
      type: 'SEARCHING_SUBSTITUTE';
      step: number;
      searchItem: string;
      remainingMissingItems: string[];
    }
  | {
      type: 'SUBSTITUTE_NOT_FOUND';
      step: number;
      searchItem: string;
      remainingMissingItems: string[];
      reason: string;
    }
  | {
      type: 'SUBSTITUTE_FOUND_MODAL';
      step: number;
      searchItem: string;
      foundSubstitute: SubstituteInfo;
      remainingMissingItems: string[];
    }

  // Plan Management
  | {
      type: 'REGENERATING_PLAN';
      step: number;
      missingItems: string[];
    }
  | {
      type: 'NEW_PLAN_MODAL';
      step: number;
      newSteps: RepairStep[];
      planRevision: number;
    }

  // Voice Settings
  | {
      type: 'VOICE_SETTINGS_MODAL';
      step: number;
      previousState: 'STEP_ACTIVE' | 'PAUSED';
    }

  // Completion
  | { type: 'SESSION_COMPLETE' }
  | { type: 'ERROR'; message: string; recoverable: boolean };

// ============================================================================
// ACTION TYPES
// ============================================================================

export type GuidedFixAction =
  // Session Lifecycle
  | { type: 'START_SESSION' }
  | { type: 'PLAN_LOADED'; steps: RepairStep[] }
  | { type: 'PLAN_LOAD_FAILED'; error: string }
  | { type: 'PERMISSIONS_GRANTED' }
  | { type: 'PERMISSIONS_DENIED' }
  | { type: 'SESSION_ENDED' }

  // Identity Verification
  | { type: 'IDENTITY_DETECTED'; item: string; expectedItem: string; requestId: string }
  | { type: 'IDENTITY_CONFIRMED' }
  | { type: 'IDENTITY_MISMATCH_SHOWN' }
  | { type: 'CONTINUE_WITH_ORIGINAL' }
  | { type: 'START_NEW_DIAGNOSIS' }
  | { type: 'FORCE_IDENTITY_CONFIRM' }

  // Frame Analysis
  | { type: 'FRAME_ANALYZED'; guidance: GuidanceResponse; requestId: string }
  | { type: 'STEP_COMPLETION_DETECTED'; evidence: string; confidence: number; requestId: string }
  | { type: 'LOW_CONFIDENCE_FRAME' }

  // Step Completion Flow
  | { type: 'SHOW_COMPLETION_MODAL'; evidence: string }
  | { type: 'COMPLETION_CONFIRMED' }
  | { type: 'COMPLETION_DENIED' }
  | { type: 'USER_REQUESTED_OVERRIDE' }
  | { type: 'OVERRIDE_CONFIRMED' }
  | { type: 'OVERRIDE_CANCELLED' }
  | { type: 'ADVANCE_TO_NEXT_STEP' }
  | { type: 'SPEECH_COMPLETE' }

  // Pause Flow
  | { type: 'PAUSE_FOR_ITEMS'; neededItems: string[] }
  | { type: 'PAUSE_FOR_WORKING'; description: string }
  | { type: 'PAUSE_FOR_TASK'; instruction: string }
  | { type: 'PAUSE_MANUAL' }
  | { type: 'TOGGLE_MISSING_ITEM'; item: string }
  | { type: 'RESUME_SESSION' }
  | { type: 'WORKING_COMPLETE' }
  | { type: 'TASK_COMPLETE' }

  // Voice Question Flow
  | { type: 'START_LISTENING' }
  | { type: 'TRANSCRIPTION_UPDATE'; text: string }
  | { type: 'QUESTION_COMPLETE'; question: string }
  | { type: 'ANSWER_RECEIVED'; answer: string }
  | { type: 'DISMISS_ANSWER' }
  | { type: 'LISTENING_CANCELLED' }

  // Conversation Flow (persistent back-and-forth)
  | { type: 'START_CONVERSATION' }
  | { type: 'ADD_TO_CONVERSATION'; role: 'user' | 'assistant'; content: string }
  | { type: 'END_CONVERSATION' }
  | { type: 'CONVERSATION_UPDATE_ITEM'; action: 'ban' | 'substitute'; item: string; substitute?: string }

  // Substitute Search Flow
  | { type: 'START_SUBSTITUTE_SEARCH' }
  | { type: 'BEGIN_SCANNING' }
  | { type: 'SUBSTITUTE_FOUND'; substitute: SubstituteInfo }
  | { type: 'SUBSTITUTE_SCAN_FAILED'; reason: string }
  | { type: 'SCAN_AGAIN' }
  | { type: 'SKIP_AND_UPDATE_PLAN' }
  | { type: 'CONFIRM_SUBSTITUTE' }
  | { type: 'KEEP_LOOKING' }
  | { type: 'SKIP_SUBSTITUTE' }
  | { type: 'CANCEL_SUBSTITUTE_SEARCH' }

  // Plan Regeneration
  | { type: 'REGENERATE_PLAN'; missingItems: string[] }
  | { type: 'PLAN_REGENERATED'; newSteps: RepairStep[]; planRevision: number }
  | { type: 'ACKNOWLEDGE_NEW_PLAN' }

  // Voice Settings
  | { type: 'OPEN_VOICE_SETTINGS' }
  | { type: 'CLOSE_VOICE_SETTINGS' }

  // Working Mode
  | { type: 'ENTER_WORKING_MODE' }
  | { type: 'EXIT_WORKING_MODE' }

  // Error Handling
  | { type: 'ERROR_OCCURRED'; message: string; recoverable: boolean }
  | { type: 'RETRY_FROM_ERROR' };

// ============================================================================
// CONTEXT (Persistent data across state transitions)
// ============================================================================

export interface GuidedFixContext {
  // Plan Data
  repairSteps: RepairStep[];
  planRevision: number;

  // Session Tracking
  currentStepIndex: number;
  identityStatus: IdentityStatus;
  identityConfirmed: boolean;
  expectedItem: string;
  confirmedItem: string;

  // Guidance
  currentGuidance: string;
  currentHighlights: BoundingBox[];
  completionEvidence: string;

  // Item Management
  permanentlyUnavailableItems: Set<string>;
  confirmedSubstitutes: Map<string, string>;

  // Voice
  conversationHistory: ConversationEntry[];
  voiceSettings: VoiceSettings;
  questionCooldownEnd: number;

  // Analysis Tracking
  nextRequestId: number;
  lowConfidenceFrameCount: number;
  lastInstruction: string;
  sameInstructionCount: number;
  stepConfirmationWindow: boolean[]; // Last 3 results for 2-of-3 rule

  // Speech
  isSpeaking: boolean;

  // Settings
  voiceEnabled: boolean;
  recognitionEnabled: boolean;
  flashEnabled: boolean;
  textBoxOpacity: number;

  // Abort Controller
  currentAbortController: AbortController | null;
}

// ============================================================================
// INITIAL CONTEXT
// ============================================================================

export function createInitialContext(): GuidedFixContext {
  return {
    repairSteps: [],
    planRevision: 0,
    currentStepIndex: 0,
    identityStatus: 'UNKNOWN',
    identityConfirmed: false,
    expectedItem: '',
    confirmedItem: '',
    currentGuidance: '',
    currentHighlights: [],
    completionEvidence: '',
    permanentlyUnavailableItems: new Set(),
    confirmedSubstitutes: new Map(),
    conversationHistory: [],
    voiceSettings: { rate: 0.9, pitch: 1.0, voiceName: 'Default' },
    questionCooldownEnd: 0,
    nextRequestId: 1,
    lowConfidenceFrameCount: 0,
    lastInstruction: '',
    sameInstructionCount: 0,
    stepConfirmationWindow: [],
    isSpeaking: false,
    voiceEnabled: true,
    recognitionEnabled: true,
    flashEnabled: false,
    textBoxOpacity: 0.85,
    currentAbortController: null,
  };
}

// ============================================================================
// REDUCER
// ============================================================================

function guidedFixReducer(
  state: GuidedFixState,
  action: GuidedFixAction,
  context: GuidedFixContext
): GuidedFixState {
  // Log all transitions for debugging
  console.log(`🔄 [${state.type}] + ${action.type}`);

  switch (state.type) {
    // ========================================================================
    // IDLE
    // ========================================================================
    case 'IDLE':
      if (action.type === 'START_SESSION') {
        return { type: 'LOADING_PLAN' };
      }
      break;

    // ========================================================================
    // LOADING_PLAN
    // ========================================================================
    case 'LOADING_PLAN':
      if (action.type === 'PLAN_LOADED') {
        return { type: 'REQUESTING_PERMISSIONS' };
      }
      if (action.type === 'PLAN_LOAD_FAILED') {
        return { type: 'ERROR', message: action.error, recoverable: true };
      }
      break;

    // ========================================================================
    // REQUESTING_PERMISSIONS
    // ========================================================================
    case 'REQUESTING_PERMISSIONS':
      if (action.type === 'PERMISSIONS_GRANTED') {
        return {
          type: 'VERIFYING_IDENTITY',
          detectedItem: '',
          expectedItem: context.expectedItem,
          mismatchCount: 0,
          requestId: `req_${context.nextRequestId}`,
        };
      }
      if (action.type === 'PERMISSIONS_DENIED') {
        return {
          type: 'ERROR',
          message: 'Camera permission is required for guided fixes',
          recoverable: true,
        };
      }
      break;

    // ========================================================================
    // VERIFYING_IDENTITY
    // ========================================================================
    case 'VERIFYING_IDENTITY':
      if (action.type === 'IDENTITY_DETECTED') {
        // If no expected item, just accept whatever is detected
        // Or if expected item is too short/generic, accept
        const expectedItemLower = action.expectedItem?.toLowerCase() || '';
        const detectedItemLower = action.item?.toLowerCase() || '';

        // Auto-match if: no expected item, OR expected is too short, OR actual substring match
        const matches = !expectedItemLower ||
                       expectedItemLower.length < 3 ||
                       detectedItemLower.includes(expectedItemLower) ||
                       expectedItemLower.includes(detectedItemLower);

        console.log(`🔍 Identity match check: detected="${action.item}", expected="${action.expectedItem}", matches=${matches}`);

        if (matches) {
          // Good match - ALWAYS pause to show step 1 info and items
          const firstStep = context.repairSteps[0];
          const firstStepItems = [
            ...(firstStep?.toolsNeeded || []),
            ...(firstStep?.materialsNeeded || []),
          ];
          // Always pause to show step info - even if no items needed
          return {
            type: 'PAUSED',
            step: 0,
            reason: 'get_item',
            neededItems: firstStepItems,
            missingItems: new Set<string>(),
            pauseMessage: firstStepItems.length > 0
              ? `Step 1: ${firstStep?.instruction || 'Get started'}\n\nGather these items:`
              : `Step 1: ${firstStep?.instruction || 'Get started'}\n\nNo special items needed.`,
          };
        } else {
          // Mismatch - increment counter
          const newMismatchCount = state.mismatchCount + 1;
          if (newMismatchCount >= 2) {
            // Show mismatch modal
            return {
              type: 'IDENTITY_MISMATCH_MODAL',
              detectedItem: action.item,
              expectedItem: action.expectedItem,
            };
          }
          // Continue verifying
          return {
            ...state,
            detectedItem: action.item,
            mismatchCount: newMismatchCount,
          };
        }
      }
      if (action.type === 'FORCE_IDENTITY_CONFIRM') {
        // ALWAYS pause to show step 1 info and items
        const forceFirstStep = context.repairSteps[0];
        const forceFirstStepItems = [
          ...(forceFirstStep?.toolsNeeded || []),
          ...(forceFirstStep?.materialsNeeded || []),
        ];
        return {
          type: 'PAUSED',
          step: 0,
          reason: 'get_item',
          neededItems: forceFirstStepItems,
          missingItems: new Set<string>(),
          pauseMessage: forceFirstStepItems.length > 0
            ? `Step 1: ${forceFirstStep?.instruction || 'Get started'}\n\nGather these items:`
            : `Step 1: ${forceFirstStep?.instruction || 'Get started'}\n\nNo special items needed.`,
        };
      }
      // Allow pausing during identity verification
      if (action.type === 'PAUSE_MANUAL') {
        return {
          type: 'PAUSED',
          step: 0, // Not on any step yet
          reason: 'manual',
          neededItems: [],
          missingItems: new Set(),
          pauseMessage: 'Identity verification paused',
        };
      }
      break;

    // ========================================================================
    // IDENTITY_MISMATCH_MODAL
    // ========================================================================
    case 'IDENTITY_MISMATCH_MODAL':
      if (action.type === 'CONTINUE_WITH_ORIGINAL') {
        return {
          type: 'VERIFYING_IDENTITY',
          detectedItem: '',
          expectedItem: state.expectedItem,
          mismatchCount: 0,
          requestId: `req_${context.nextRequestId}`,
        };
      }
      if (action.type === 'START_NEW_DIAGNOSIS') {
        return { type: 'IDLE' }; // Navigation handled in component
      }
      if (action.type === 'SESSION_ENDED') {
        return { type: 'IDLE' };
      }
      break;

    // ========================================================================
    // STEP_ACTIVE
    // ========================================================================
    case 'STEP_ACTIVE':
      // Frame analysis
      if (action.type === 'FRAME_ANALYZED') {
        return state; // Context updated by dispatch wrapper
      }

      // Completion detection - immediately show modal (no two-frame requirement)
      if (action.type === 'STEP_COMPLETION_DETECTED') {
        if (action.confidence >= 0.7) {
          // Show completion modal immediately
          return {
            type: 'COMPLETION_SUGGESTED_MODAL',
            step: state.step,
            evidence: action.evidence,
          };
        }
        return state;
      }

      // AI suggests completion (show modal)
      if (action.type === 'SHOW_COMPLETION_MODAL') {
        return {
          type: 'COMPLETION_SUGGESTED_MODAL',
          step: state.step,
          evidence: action.evidence,
        };
      }

      // User requested override (wants to skip without AI confirmation)
      if (action.type === 'USER_REQUESTED_OVERRIDE') {
        return {
          type: 'OVERRIDE_CONFIRMATION_MODAL',
          step: state.step,
          instruction: context.repairSteps[state.step]?.instruction || '',
        };
      }

      // Pause actions
      if (action.type === 'PAUSE_FOR_ITEMS') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'get_item',
          neededItems: action.neededItems,
          missingItems: new Set(),
        };
      }
      if (action.type === 'PAUSE_FOR_WORKING') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'working_on_step',
          neededItems: [],
          missingItems: new Set(),
          workingStepDescription: action.description,
        };
      }
      if (action.type === 'PAUSE_FOR_TASK') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'do_task',
          neededItems: [],
          missingItems: new Set(),
          taskInstruction: action.instruction,
        };
      }
      if (action.type === 'PAUSE_MANUAL') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'manual',
          neededItems: [],
          missingItems: new Set(),
        };
      }

      // Voice question
      if (action.type === 'START_LISTENING') {
        return {
          type: 'LISTENING',
          step: state.step,
          transcription: '',
        };
      }

      // Working mode
      if (action.type === 'ENTER_WORKING_MODE') {
        return {
          ...state,
          isWorkingMode: true,
          workingModeStartTime: Date.now(),
        };
      }
      if (action.type === 'EXIT_WORKING_MODE') {
        return {
          ...state,
          isWorkingMode: false,
          workingModeStartTime: undefined,
        };
      }

      // Voice settings
      if (action.type === 'OPEN_VOICE_SETTINGS') {
        return {
          type: 'VOICE_SETTINGS_MODAL',
          step: state.step,
          previousState: 'STEP_ACTIVE',
        };
      }
      break;

    // ========================================================================
    // CONFIRMING_COMPLETION (Two-frame stability)
    // ========================================================================
    case 'CONFIRMING_COMPLETION':
      if (action.type === 'STEP_COMPLETION_DETECTED' && action.requestId === state.requestId) {
        const newCount = state.confirmationCount + 1;
        if (newCount >= 2) {
          // Two consecutive frames confirmed - show modal
          return {
            type: 'COMPLETION_SUGGESTED_MODAL',
            step: state.step,
            evidence: state.evidence,
          };
        }
        return { ...state, confirmationCount: newCount };
      }
      if (action.type === 'FRAME_ANALYZED') {
        // If new frame doesn't confirm, reset to STEP_ACTIVE
        if (!action.guidance.stepComplete || action.guidance.confidence < 0.7) {
          return {
            type: 'STEP_ACTIVE',
            step: state.step,
            stepStatus: 'IN_PROGRESS',
            isWorkingMode: false,
            requestId: `req_${context.nextRequestId}`,
            startTime: Date.now(),
            lastGuidanceTime: 0,
          };
        }
      }
      break;

    // ========================================================================
    // COMPLETION_SUGGESTED_MODAL
    // ========================================================================
    case 'COMPLETION_SUGGESTED_MODAL':
      if (action.type === 'COMPLETION_CONFIRMED') {
        const nextStep = state.step + 1;
        if (nextStep >= context.repairSteps.length) {
          return { type: 'SESSION_COMPLETE' };
        }
        // ALWAYS pause to show next step info and items
        const nextStepData = context.repairSteps[nextStep];
        const neededItems = [
          ...(nextStepData?.toolsNeeded || []),
          ...(nextStepData?.materialsNeeded || []),
        ];
        // Always pause to introduce the step - even if no items needed
        return {
          type: 'PAUSED',
          step: nextStep,
          reason: 'get_item',
          neededItems,
          missingItems: new Set<string>(),
          pauseMessage: neededItems.length > 0
            ? `Step ${nextStep + 1}: ${nextStepData?.instruction || 'Next step'}\n\nGather these items:`
            : `Step ${nextStep + 1}: ${nextStepData?.instruction || 'Next step'}\n\nNo special items needed.`,
        };
      }
      if (action.type === 'COMPLETION_DENIED') {
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }
      break;

    // ========================================================================
    // OVERRIDE_CONFIRMATION_MODAL
    // ========================================================================
    case 'OVERRIDE_CONFIRMATION_MODAL':
      if (action.type === 'OVERRIDE_CONFIRMED') {
        const nextStep = state.step + 1;
        if (nextStep >= context.repairSteps.length) {
          return { type: 'SESSION_COMPLETE' };
        }
        // ALWAYS pause to show next step info and items
        const overrideNextStepData = context.repairSteps[nextStep];
        const overrideNeededItems = [
          ...(overrideNextStepData?.toolsNeeded || []),
          ...(overrideNextStepData?.materialsNeeded || []),
        ];
        // Always pause to introduce the step - even if no items needed
        return {
          type: 'PAUSED',
          step: nextStep,
          reason: 'get_item',
          neededItems: overrideNeededItems,
          missingItems: new Set<string>(),
          pauseMessage: overrideNeededItems.length > 0
            ? `Step ${nextStep + 1}: ${overrideNextStepData?.instruction || 'Next step'}\n\nGather these items:`
            : `Step ${nextStep + 1}: ${overrideNextStepData?.instruction || 'Next step'}\n\nNo special items needed.`,
        };
      }
      if (action.type === 'OVERRIDE_CANCELLED') {
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }
      break;

    // ========================================================================
    // PAUSED
    // ========================================================================
    case 'PAUSED':
      if (action.type === 'TOGGLE_MISSING_ITEM') {
        const newMissing = new Set(state.missingItems);
        if (newMissing.has(action.item)) {
          newMissing.delete(action.item);
        } else {
          newMissing.add(action.item);
        }
        return { ...state, missingItems: newMissing };
      }

      if (action.type === 'START_SUBSTITUTE_SEARCH') {
        const missingArray = Array.from(state.missingItems);
        if (missingArray.length > 0) {
          // Go to READY state first - user must click "Start Scanning"
          return {
            type: 'SUBSTITUTE_SCAN_READY',
            step: state.step,
            searchItem: missingArray[0],
            remainingMissingItems: missingArray.slice(1),
          };
        }
        return state;
      }

      if (action.type === 'REGENERATE_PLAN') {
        return {
          type: 'REGENERATING_PLAN',
          step: state.step,
          missingItems: action.missingItems,
        };
      }

      if (action.type === 'RESUME_SESSION' || action.type === 'WORKING_COMPLETE' || action.type === 'TASK_COMPLETE') {
        // If resuming from step 0 and identity not confirmed, go back to verifying identity
        if (state.step === 0 && !context.identityConfirmed) {
          return {
            type: 'VERIFYING_IDENTITY',
            detectedItem: '',
            expectedItem: context.expectedItem,
            mismatchCount: 0,
            requestId: `req_${context.nextRequestId}`,
          };
        }
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }

      if (action.type === 'OPEN_VOICE_SETTINGS') {
        return {
          type: 'VOICE_SETTINGS_MODAL',
          step: state.step,
          previousState: 'PAUSED',
        };
      }

      // User wants to manually mark step complete from paused state
      if (action.type === 'USER_REQUESTED_OVERRIDE') {
        return {
          type: 'OVERRIDE_CONFIRMATION_MODAL',
          step: state.step,
          instruction: context.repairSteps[state.step]?.instruction || '',
        };
      }
      break;

    // ========================================================================
    // LISTENING (Voice Question)
    // ========================================================================
    case 'LISTENING':
      if (action.type === 'TRANSCRIPTION_UPDATE') {
        return { ...state, transcription: action.text };
      }
      if (action.type === 'QUESTION_COMPLETE') {
        return {
          type: 'PROCESSING_QUESTION',
          step: state.step,
          question: action.question,
        };
      }
      if (action.type === 'LISTENING_CANCELLED') {
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }
      break;

    // ========================================================================
    // PROCESSING_QUESTION
    // ========================================================================
    case 'PROCESSING_QUESTION':
      if (action.type === 'ANSWER_RECEIVED') {
        return {
          type: 'SHOWING_ANSWER',
          step: state.step,
          question: state.question,
          answer: action.answer,
        };
      }
      if (action.type === 'ERROR_OCCURRED') {
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }
      break;

    // ========================================================================
    // SHOWING_ANSWER
    // ========================================================================
    case 'SHOWING_ANSWER':
      if (action.type === 'DISMISS_ANSWER') {
        // Transition to CONVERSATION mode to allow follow-up questions
        return {
          type: 'CONVERSATION',
          step: state.step,
          conversationHistory: [
            { role: 'user', content: state.question },
            { role: 'assistant', content: state.answer },
          ],
        };
      }
      break;

    // ========================================================================
    // CONVERSATION (persistent back-and-forth mode)
    // ========================================================================
    case 'CONVERSATION':
      if (action.type === 'ADD_TO_CONVERSATION') {
        return {
          ...state,
          conversationHistory: [
            ...state.conversationHistory,
            { role: action.role, content: action.content },
          ],
        };
      }
      if (action.type === 'END_CONVERSATION') {
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }
      if (action.type === 'START_LISTENING') {
        // Allow starting to listen for another question while in conversation
        return {
          type: 'LISTENING',
          step: state.step,
          transcription: '',
        };
      }
      break;

    // ========================================================================
    // SUBSTITUTE_SCAN_READY (User sees "Start Scanning" button)
    // ========================================================================
    case 'SUBSTITUTE_SCAN_READY':
      if (action.type === 'BEGIN_SCANNING') {
        return {
          type: 'SEARCHING_SUBSTITUTE',
          step: state.step,
          searchItem: state.searchItem,
          remainingMissingItems: state.remainingMissingItems,
        };
      }
      if (action.type === 'SKIP_AND_UPDATE_PLAN') {
        // Skip searching, go straight to plan regeneration
        return {
          type: 'REGENERATING_PLAN',
          step: state.step,
          missingItems: [state.searchItem, ...state.remainingMissingItems],
        };
      }
      if (action.type === 'CANCEL_SUBSTITUTE_SEARCH') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'get_item',
          neededItems: [state.searchItem, ...state.remainingMissingItems],
          missingItems: new Set([state.searchItem, ...state.remainingMissingItems]),
        };
      }
      break;

    // ========================================================================
    // SEARCHING_SUBSTITUTE (Active scanning)
    // ========================================================================
    case 'SEARCHING_SUBSTITUTE':
      if (action.type === 'SUBSTITUTE_FOUND') {
        return {
          type: 'SUBSTITUTE_FOUND_MODAL',
          step: state.step,
          searchItem: state.searchItem,
          foundSubstitute: action.substitute,
          remainingMissingItems: state.remainingMissingItems,
        };
      }
      if (action.type === 'SUBSTITUTE_SCAN_FAILED') {
        return {
          type: 'SUBSTITUTE_NOT_FOUND',
          step: state.step,
          searchItem: state.searchItem,
          remainingMissingItems: state.remainingMissingItems,
          reason: action.reason,
        };
      }
      if (action.type === 'CANCEL_SUBSTITUTE_SEARCH') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'get_item',
          neededItems: [state.searchItem, ...state.remainingMissingItems],
          missingItems: new Set([state.searchItem, ...state.remainingMissingItems]),
        };
      }
      break;

    // ========================================================================
    // SUBSTITUTE_NOT_FOUND (No matching items found)
    // ========================================================================
    case 'SUBSTITUTE_NOT_FOUND':
      if (action.type === 'SCAN_AGAIN') {
        // Go back to ready state to let user position camera
        return {
          type: 'SUBSTITUTE_SCAN_READY',
          step: state.step,
          searchItem: state.searchItem,
          remainingMissingItems: state.remainingMissingItems,
        };
      }
      if (action.type === 'SKIP_AND_UPDATE_PLAN') {
        // Skip this item, regenerate plan without it
        return {
          type: 'REGENERATING_PLAN',
          step: state.step,
          missingItems: [state.searchItem, ...state.remainingMissingItems],
        };
      }
      if (action.type === 'CANCEL_SUBSTITUTE_SEARCH') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'get_item',
          neededItems: [state.searchItem, ...state.remainingMissingItems],
          missingItems: new Set([state.searchItem, ...state.remainingMissingItems]),
        };
      }
      break;

    // ========================================================================
    // SUBSTITUTE_FOUND_MODAL
    // ========================================================================
    case 'SUBSTITUTE_FOUND_MODAL':
      if (action.type === 'CONFIRM_SUBSTITUTE') {
        // If there are more missing items, go to READY state for next item
        if (state.remainingMissingItems.length > 0) {
          return {
            type: 'SUBSTITUTE_SCAN_READY',
            step: state.step,
            searchItem: state.remainingMissingItems[0],
            remainingMissingItems: state.remainingMissingItems.slice(1),
          };
        }
        // All substitutes found, regenerate plan
        return {
          type: 'REGENERATING_PLAN',
          step: state.step,
          missingItems: [],
        };
      }
      if (action.type === 'KEEP_LOOKING') {
        // Go back to ready state to let user reposition camera
        return {
          type: 'SUBSTITUTE_SCAN_READY',
          step: state.step,
          searchItem: state.searchItem,
          remainingMissingItems: state.remainingMissingItems,
        };
      }
      if (action.type === 'SKIP_SUBSTITUTE') {
        // Skip this item, go to plan regeneration
        return {
          type: 'REGENERATING_PLAN',
          step: state.step,
          missingItems: [state.searchItem, ...state.remainingMissingItems],
        };
      }
      break;

    // ========================================================================
    // REGENERATING_PLAN
    // ========================================================================
    case 'REGENERATING_PLAN':
      if (action.type === 'PLAN_REGENERATED') {
        return {
          type: 'NEW_PLAN_MODAL',
          step: state.step,
          newSteps: action.newSteps,
          planRevision: action.planRevision,
        };
      }
      if (action.type === 'ERROR_OCCURRED') {
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'get_item',
          neededItems: state.missingItems,
          missingItems: new Set(state.missingItems),
        };
      }
      break;

    // ========================================================================
    // NEW_PLAN_MODAL
    // ========================================================================
    case 'NEW_PLAN_MODAL':
      if (action.type === 'ACKNOWLEDGE_NEW_PLAN') {
        // After acknowledging new plan, PAUSE to show step details and items
        // This gives user time to understand the new step before resuming
        const newPlanStep = context.repairSteps[state.step];
        const newPlanNeededItems = [
          ...(newPlanStep?.toolsNeeded || []),
          ...(newPlanStep?.materialsNeeded || []),
        ];
        return {
          type: 'PAUSED',
          step: state.step,
          reason: 'get_item',
          neededItems: newPlanNeededItems,
          missingItems: new Set<string>(),
          pauseMessage: newPlanNeededItems.length > 0
            ? `Step ${state.step + 1}: ${newPlanStep?.instruction || 'Continue with updated plan'}\n\nGather these items:`
            : `Step ${state.step + 1}: ${newPlanStep?.instruction || 'Continue with updated plan'}\n\nNo special items needed.`,
        };
      }
      break;

    // ========================================================================
    // VOICE_SETTINGS_MODAL
    // ========================================================================
    case 'VOICE_SETTINGS_MODAL':
      if (action.type === 'CLOSE_VOICE_SETTINGS') {
        if (state.previousState === 'PAUSED') {
          return {
            type: 'PAUSED',
            step: state.step,
            reason: 'manual',
            neededItems: [],
            missingItems: new Set(),
          };
        }
        return {
          type: 'STEP_ACTIVE',
          step: state.step,
          stepStatus: 'IN_PROGRESS',
          isWorkingMode: false,
          requestId: `req_${context.nextRequestId}`,
          startTime: Date.now(),
          lastGuidanceTime: 0,
        };
      }
      break;

    // ========================================================================
    // ERROR
    // ========================================================================
    case 'ERROR':
      if (action.type === 'RETRY_FROM_ERROR' && state.recoverable) {
        return { type: 'IDLE' };
      }
      break;
  }

  // Global actions handled from any state
  if (action.type === 'SESSION_ENDED') {
    return { type: 'IDLE' };
  }
  if (action.type === 'ERROR_OCCURRED') {
    return { type: 'ERROR', message: action.message, recoverable: action.recoverable };
  }

  // No valid transition, return current state
  console.log(`⚠️ No transition for [${state.type}] + ${action.type}`);
  return state;
}

// ============================================================================
// HOOK
// ============================================================================

export function useGuidedFixStateMachine(initialSteps: RepairStep[] = []) {
  const contextRef = useRef<GuidedFixContext>(createInitialContext());

  // Initialize with steps if provided
  if (initialSteps.length > 0 && contextRef.current.repairSteps.length === 0) {
    contextRef.current.repairSteps = initialSteps;
  }

  const [state, dispatchRaw] = useReducer(
    (state: GuidedFixState, action: GuidedFixAction) => {
      const newState = guidedFixReducer(state, action, contextRef.current);
      console.log(`✅ NEW STATE: ${newState.type}`);
      return newState;
    },
    { type: 'IDLE' }
  );

  // Enhanced dispatch that updates context
  const dispatch = (action: GuidedFixAction) => {
    const ctx = contextRef.current;

    // Update context based on action
    switch (action.type) {
      case 'PLAN_LOADED':
        ctx.repairSteps = action.steps;
        break;

      case 'IDENTITY_CONFIRMED':
      case 'FORCE_IDENTITY_CONFIRM':
        ctx.identityConfirmed = true;
        ctx.identityStatus = 'CONFIRMED';
        break;

      case 'IDENTITY_DETECTED': {
        // Check if identity matches - if so, mark as confirmed
        const expectedItemLower = action.expectedItem?.toLowerCase() || '';
        const detectedItemLower = action.item?.toLowerCase() || '';
        const identityMatches = !expectedItemLower ||
                               expectedItemLower.length < 3 ||
                               detectedItemLower.includes(expectedItemLower) ||
                               expectedItemLower.includes(detectedItemLower);
        if (identityMatches) {
          ctx.identityConfirmed = true;
          ctx.identityStatus = 'CONFIRMED';
          ctx.confirmedItem = action.item;
          console.log(`✅ Identity confirmed: ${action.item}`);
        }
        break;
      }

      case 'FRAME_ANALYZED':
        ctx.currentGuidance = action.guidance.instruction || ctx.currentGuidance;
        ctx.currentHighlights = action.guidance.highlights || [];
        if (action.guidance.confidence >= 0.5) {
          ctx.lowConfidenceFrameCount = 0;
        }
        // Track same instruction count
        if (action.guidance.instruction === ctx.lastInstruction) {
          ctx.sameInstructionCount++;
        } else {
          ctx.lastInstruction = action.guidance.instruction || '';
          ctx.sameInstructionCount = 0;
        }
        break;

      case 'LOW_CONFIDENCE_FRAME':
        ctx.lowConfidenceFrameCount++;
        break;

      case 'SHOW_COMPLETION_MODAL':
        ctx.completionEvidence = action.evidence;
        break;

      case 'COMPLETION_CONFIRMED':
      case 'OVERRIDE_CONFIRMED':
        ctx.currentStepIndex++;
        ctx.lowConfidenceFrameCount = 0;
        ctx.sameInstructionCount = 0;
        ctx.stepConfirmationWindow = [];
        // Clear guidance from previous step so it doesn't linger
        ctx.currentGuidance = '';
        ctx.currentHighlights = [];
        ctx.lastInstruction = '';
        break;

      case 'CONFIRM_SUBSTITUTE':
        // This is handled by the component that has access to the substitute info
        break;

      case 'PLAN_REGENERATED':
        ctx.repairSteps = action.newSteps;
        ctx.planRevision = action.planRevision;
        // Clear guidance so old step guidance doesn't show
        ctx.currentGuidance = '';
        ctx.currentHighlights = [];
        ctx.lastInstruction = '';
        break;

      case 'ANSWER_RECEIVED':
        ctx.conversationHistory.push({
          role: 'assistant',
          content: action.answer,
          timestamp: Date.now(),
        });
        // Keep only last 5 entries
        if (ctx.conversationHistory.length > 10) {
          ctx.conversationHistory = ctx.conversationHistory.slice(-10);
        }
        break;

      case 'QUESTION_COMPLETE':
        ctx.conversationHistory.push({
          role: 'user',
          content: action.question,
          timestamp: Date.now(),
        });
        ctx.questionCooldownEnd = Date.now() + 5000; // 5 second cooldown
        break;

      case 'CONVERSATION_UPDATE_ITEM':
        if (action.action === 'ban') {
          ctx.permanentlyUnavailableItems.add(action.item.toLowerCase());
          console.log(`🚫 Banned item from conversation: ${action.item}`);
        } else if (action.action === 'substitute' && action.substitute) {
          ctx.permanentlyUnavailableItems.add(action.item.toLowerCase());
          ctx.confirmedSubstitutes.set(action.item.toLowerCase(), action.substitute.toLowerCase());
          console.log(`✅ Substitute from conversation: ${action.item} -> ${action.substitute}`);
        }
        break;

      case 'ADD_TO_CONVERSATION':
        ctx.conversationHistory.push({
          role: action.role,
          content: action.content,
          timestamp: Date.now(),
        });
        // Keep only last 10 entries
        if (ctx.conversationHistory.length > 10) {
          ctx.conversationHistory = ctx.conversationHistory.slice(-10);
        }
        break;
    }

    // Increment request ID for relevant actions
    if (['RESUME_SESSION', 'WORKING_COMPLETE', 'TASK_COMPLETE', 'DISMISS_ANSWER',
         'ACKNOWLEDGE_NEW_PLAN', 'CONTINUE_WITH_ORIGINAL', 'COMPLETION_DENIED',
         'OVERRIDE_CANCELLED', 'COMPLETION_CONFIRMED', 'OVERRIDE_CONFIRMED',
         'CLOSE_VOICE_SETTINGS', 'END_CONVERSATION'].includes(action.type)) {
      ctx.nextRequestId++;
    }

    dispatchRaw(action);
  };

  // Abort controller management
  // Only abort when leaving states that allow frame capture
  useEffect(() => {
    const ctx = contextRef.current;
    const isActiveState = state.type === 'STEP_ACTIVE' ||
                          state.type === 'CONFIRMING_COMPLETION' ||
                          state.type === 'VERIFYING_IDENTITY';
    if (!isActiveState) {
      if (ctx.currentAbortController) {
        console.log('🚫 Aborting request due to state change');
        ctx.currentAbortController.abort();
        ctx.currentAbortController = null;
      }
    }
  }, [state.type]);

  return {
    state,
    dispatch,
    context: contextRef.current,
  };
}

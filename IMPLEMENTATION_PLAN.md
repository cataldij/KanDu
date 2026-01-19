# Implementation Plan: Complete GuidedFixScreen Rebuild

## Objective
Create a production-quality GuidedFixScreen that combines:
- **State Machine Architecture** (from new version) - for reliability and predictability
- **All Features & UI** (from old version) - for complete functionality
- **Efficiency Improvements** - for a flawless user experience

---

## Architecture Overview

### State Machine States (Enhanced)
```typescript
type GuidedFixState =
  // Initial States
  | { type: 'LOADING_PLAN' }
  | { type: 'REQUESTING_PERMISSIONS' }

  // Identity Verification
  | { type: 'VERIFYING_IDENTITY'; detectedItem: string; expectedItem: string; mismatchCount: number }
  | { type: 'IDENTITY_MISMATCH'; detectedItem: string; expectedItem: string }

  // Step Execution
  | { type: 'STEP_ACTIVE'; step: number; substep: 'GUIDANCE' | 'WORKING' | 'CONFIRMING' }
  | { type: 'STEP_COMPLETION_SUGGESTED'; step: number; evidence: string }
  | { type: 'STEP_OVERRIDE_REQUESTED'; step: number }

  // Pause States
  | { type: 'PAUSED'; reason: 'manual' | 'get_item' | 'working_on_step' | 'do_task'; data?: any }

  // Voice Question
  | { type: 'LISTENING_FOR_QUESTION' }
  | { type: 'PROCESSING_QUESTION'; question: string }
  | { type: 'SHOWING_ANSWER'; answer: string }

  // Substitute Search
  | { type: 'SEARCHING_SUBSTITUTE'; item: string }
  | { type: 'SUBSTITUTE_FOUND'; item: string; substitute: SubstituteInfo }

  // Plan Management
  | { type: 'REGENERATING_PLAN'; missingItems: string[] }
  | { type: 'SHOWING_NEW_PLAN'; newSteps: RepairStep[] }

  // Completion
  | { type: 'SESSION_COMPLETE' }
  | { type: 'ERROR'; message: string; recoverable: boolean }
```

### Context (Persistent Data)
```typescript
interface GuidedFixContext {
  // Plan Data
  repairSteps: RepairStep[];
  planRevision: number;

  // Session Tracking
  currentStepIndex: number;
  stepStatus: 'IN_PROGRESS' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'OVERRIDDEN';

  // Item Management
  permanentlyUnavailableItems: Set<string>;
  confirmedSubstitutes: Map<string, string>;
  missingItems: Set<string>;
  neededItems: string[];

  // Identity
  expectedItem: string;
  detectedItem: string;
  identityConfirmed: boolean;

  // Guidance
  currentGuidance: string;
  currentHighlights: BoundingBox[];
  completionEvidence: string;

  // Voice
  conversationHistory: ConversationEntry[];
  voiceQuestion: string;
  voiceAnswer: string;

  // Substitute
  foundSubstitute: SubstituteInfo | null;
  substituteSearchItem: string;

  // Working Mode
  workingStepDescription: string;
  taskInstruction: string;

  // Analysis Tracking
  requestId: number;
  lowConfidenceCount: number;
  confirmationFrameCount: number;

  // Settings
  isSpeaking: boolean;
}
```

---

## File Structure

```
screens/
  GuidedFixScreenNew.tsx     # Main screen (will be rebuilt)

hooks/
  useGuidedFixStateMachine.ts  # Core state machine (will be updated)

services/
  frameCapture.ts            # Frame capture service (exists)
  guidedFix.ts               # API service (exists)
  api.ts                     # Voice question & substitute APIs (exists)

components/
  GuidedFixModals.tsx        # NEW: All modals in one file
  GuidedFixActionRow.tsx     # NEW: Top action row with controls
  GuidedFixGuidance.tsx      # NEW: Bottom guidance area
  GuidedFixHighlights.tsx    # NEW: Bounding box overlays
  GuidedFixVoiceUI.tsx       # NEW: Voice question UI
```

---

## Phase 1: Core State Machine Enhancement

### 1.1 Update State Types
- Add all pause reasons
- Add voice question states
- Add substitute search states
- Add identity mismatch state
- Add step confirmation states

### 1.2 Update Reducer
- Handle all new action types
- Implement proper transitions
- Ensure no invalid states possible

### 1.3 Add Request Gating
- Track request IDs
- Reject stale responses
- AbortController for cancellation

---

## Phase 2: Modal Components

### 2.1 Identity Mismatch Modal
Exact copy from old version - shows when AI detects wrong item.

### 2.2 Override Confirmation Modal
Exact copy - user wants to skip AI confirmation.

### 2.3 AI Completion Suggestion Modal
Exact copy - AI thinks step is complete.

### 2.4 Session Paused Modal (Complex)
Four different modes:
- `get_item`: Item checklist + find substitute
- `working_on_step`: Working status + done button
- `do_task`: Task instruction + completion button
- `manual`: Simple resume button

### 2.5 New Plan Modal
Shows updated steps after regeneration.

### 2.6 Substitute Search Overlay
Full-screen scanning mode.

### 2.7 Substitute Confirmation Modal
Shows found substitute for approval.

### 2.8 Voice Settings Modal
Speed, pitch, opacity, voice selection.

---

## Phase 3: Voice Question System

### 3.1 Speech Recognition
- Integrate expo-speech-recognition
- Real-time transcription
- Wake word detection
- Constraint detection

### 3.2 Voice Question API
- Send question + context + frame
- Receive answer
- Display in overlay

### 3.3 Conversation History
- Track last 5 exchanges
- Send as context to API

### 3.4 Answer Display
- Chat bubble style
- Auto-dismiss timer
- Manual dismiss button

---

## Phase 4: Substitute Search System

### 4.1 Search Trigger
- From pause modal when items missing
- Opens full-screen scanning mode

### 4.2 Continuous Scanning
- Capture frames every 3 seconds
- Call findSubstitute API
- Show found items

### 4.3 Confirmation Flow
- Show substitute details
- User approves or continues searching
- Update plan on confirmation

### 4.4 Plan Regeneration
- Track unavailable items
- Track confirmed substitutes
- Generate new plan
- Show new plan modal

---

## Phase 5: Visual Highlights

### 5.1 Bounding Box Processing
- Convert percentages to pixels
- Handle screen dimensions
- Account for safe areas

### 5.2 Highlight Rendering
- Green circles with glow
- Label bubbles
- Smooth updates

### 5.3 Toggle Control
- Eye icon toggle
- Clear on disable
- Restore on enable

---

## Phase 6: Action Row & Controls

### 6.1 Action Row Layout
- Stop button (left)
- Control toggles (right):
  - Flash
  - Recognition
  - Voice
  - Settings (gear icon)
  - Pause

### 6.2 Settings Modal
- Move opacity controls here
- Voice speed/pitch
- Voice selection

### 6.3 Flash Integration
- enableTorch on camera
- Visual feedback

---

## Phase 7: Guidance Area

### 7.1 Progress Bar
- Step progress
- Plan revision badge
- Colored by version

### 7.2 Guidance Box
- Transparent background
- Adjustable opacity
- Current instruction

### 7.3 Step Status Badge
- In Progress (yellow)
- Confirmed (green)

### 7.4 Action Buttons
- "Next Step" / "I Did This Step" / "Finish"
- Disabled/enabled states

### 7.5 Voice Question Button
- Mic icon
- Question preview
- Answer display

---

## Phase 8: Efficiency Improvements

### 8.1 Smart Frame Capture
- Adaptive intervals based on activity
- Faster during active work
- Slower during pauses

### 8.2 Response Caching
- Cache recent guidance
- Don't re-speak same instruction
- Track instruction repetition

### 8.3 Request Optimization
- AbortController for in-flight requests
- Debounce rapid changes
- Queue management

### 8.4 Speech Optimization
- Queue management
- Priority system (urgent vs normal)
- Don't repeat same guidance

### 8.5 Memory Management
- Clean up refs properly
- Clear intervals on unmount
- Avoid memory leaks

---

## Phase 9: Error Handling

### 9.1 Network Errors
- Graceful degradation
- Retry with backoff
- User feedback

### 9.2 Camera Errors
- Permission handling
- Fallback modes

### 9.3 Speech Errors
- Fallback to text only
- Silent mode detection

### 9.4 API Errors
- Rate limiting handling
- Error recovery

---

## Phase 10: Testing & Deployment

### 10.1 Unit Tests
- State machine transitions
- Reducer logic
- API mocking

### 10.2 Integration Tests
- Full flow testing
- Modal interactions
- Voice question flow

### 10.3 Performance Testing
- Frame rate
- Memory usage
- Battery impact

### 10.4 User Testing
- Real device testing
- Edge case scenarios

### 10.5 Deployment
- EAS OTA update
- Rollback plan

---

## Success Criteria

1. **No bugs from old version** (race conditions, stale responses, etc.)
2. **All features from old version** (every modal, every control, every interaction)
3. **Exact same look** (pixel-perfect UI match)
4. **Better efficiency** (faster, smoother, more reliable)
5. **Flawless user experience** (trustworthy, predictable, helpful)

---

## Timeline Estimate

This is a multi-session effort. Each phase should be completed and tested before moving to the next.

**Priority Order:**
1. Phase 1 (State Machine) - Foundation
2. Phase 2 (Modals) - Core UI
3. Phase 6 (Action Row) - Controls
4. Phase 7 (Guidance) - Main display
5. Phase 3 (Voice) - Talk back
6. Phase 4 (Substitute) - Item search
7. Phase 5 (Highlights) - Visual feedback
8. Phase 8 (Efficiency) - Polish
9. Phase 9 (Errors) - Reliability
10. Phase 10 (Testing) - Quality assurance

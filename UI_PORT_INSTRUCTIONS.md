# UI Port Instructions - Old Look with New State Machine

## What Needs to Change

The user wants the OLD UI appearance (fullscreen camera, transparent guidance box, logo at top, control buttons) combined with the NEW state machine logic.

## Key UI Elements to Port

### 1. **Fullscreen Camera with Overlay**
- Camera uses `StyleSheet.absoluteFillObject` (edge-to-edge)
- UI elements positioned absolutely on top
- **Status bar hidden** for immersive experience

### 2. **Logo at Top**
- Large KanDu Together logo (70% width, 120px height)
- Positioned at top with safe area inset
- No background box

### 3. **Control Buttons Row**
- Semi-transparent background: `rgba(0, 0, 0, 0.3)`
- Buttons: Stop, Flash, Recognition Toggle, Voice, Settings, Pause
- Circular buttons with icons
- Flash button turns orange when active
- Recognition button turns green when enabled

### 4. **Transparent Guidance Box at Bottom**
- Background: `rgba(0, 0, 0, ${textBoxOpacity})` (default 0.55)
- White text for high contrast
- Contains current guidance
- User can adjust opacity with +/- buttons

### 5. **Progress Bar**
- Shows below logo/buttons
- Green fill with percentage complete
- Text: "Step X of Y"

### 6. **Highlights/Bounding Boxes**
- Bright green circles (`#00FF88`)
- Glow effect with shadows
- Label bubble above circle
- Positioned in pixels (not percentages)

## Files to Reference for Exact Styling

**Main Styles:**
- `screens/GuidedFixScreen.tsx` lines 3627-4200
- Key styles: `container`, `headerLogo`, `actionRow`, `guidanceContainer`, `guidanceBox`, `highlightCircle`

**Layout:**
- `screens/GuidedFixScreen.tsx` lines 3316-3580
- Camera with `StyleSheet.absoluteFillObject`
- Overlay with absolutely positioned children

## Implementation Strategy

Since the file is large, the best approach is:

1. Keep the state machine logic in `GuidedFixScreenNew.tsx` (already done ✅)
2. Replace the entire render section with the old UI layout
3. Connect old UI controls to new state machine:
   - Flash toggle → `flashEnabled` state
   - Recognition toggle → controls frame capture
   - Voice toggle → `voiceEnabled` (affects speech)
   - Pause button → dispatch `USER_PAUSED`
   - Stop button → `handleEndSession()`
   - Next step button → dispatch `USER_CONFIRMED_STEP`

4. Copy styles from old version (lines 3627-4200)

## Quick Win Approach

The fastest way: **Copy the entire render section and styles from GuidedFixScreen.tsx**, then:

1. Replace all old state variable references with state machine equivalents:
   - `currentStepIndex` → `state.step` (when in `STEP_ACTIVE`)
   - `currentGuidance` → `context.currentGuidance`
   - `repairSteps` → `context.repairSteps`
   - `highlights` → `context.currentHighlights`
   - `identityStatus` → check `state.type === 'VERIFYING_IDENTITY'`
   - `isLoadingPlan` → `state.type === 'IDLE'` or loading state
   - `sessionActive` → `state.type !== 'ERROR'` and `!== 'IDLE'`

2. Replace handler calls with state machine dispatches:
   - `handleNextStep()` → `dispatch({ type: 'USER_CONFIRMED_STEP' })`
   - `handleManualPause()` → `dispatch({ type: 'USER_PAUSED', reason: 'manual' })`
   - `handleStopSession()` → `handleEndSession()` (already exists)

3. Keep the new modals (IdentityVerificationModal, ToolsCheckingModal, EscalationModal) - they're cleaner

## What I've Done So Far

✅ Added logo import
✅ Added Image to imports
✅ Added UI control states (flashEnabled, recognitionEnabled, voiceEnabled, textBoxOpacity)
✅ Added toggle handlers (toggleFlash, toggleRecognition, toggleVoice, adjustOpacity)
✅ State machine is fully functional

## What's Left

❌ Replace main render section (lines ~320-460 in GuidedFixScreenNew.tsx)
❌ Copy styles section from old version
❌ Map state machine states to UI visibility
❌ Test the integration

## Why This is Better Than Doing It Manually

The render section is ~200 lines and the styles are ~600 lines. Copying and doing find/replace is faster and less error-prone than manually typing each change.

---

**Recommendation:** I can generate a complete replacement file, or walk you through the copy/paste approach. Which would you prefer?

# Feature Comparison: Old vs New GuidedFixScreen

This document compares what exists in the OLD version vs what's in the NEW state machine version, to identify everything that needs to be ported.

---

## Summary

| Category | Old Version | New Version | Status |
|----------|-------------|-------------|--------|
| **Core State Machine** | 40+ useState variables | useReducer state machine | ✅ Better in new |
| **Modals** | 8 modals fully styled | 3 basic modals | ❌ Need to port |
| **Voice Input (Talk Back)** | Full speech recognition | None | ❌ Need to port |
| **Voice Output (TTS)** | Full with settings | Basic | ⚠️ Partial |
| **Settings Gear Icon** | Voice settings modal | None | ❌ Need to port |
| **Opacity Controls** | In settings modal | On main screen | ❌ Move to settings |
| **Substitute Search** | Full cabinet scanning | None | ❌ Need to port |
| **Visual Highlights** | Bounding boxes + circles | None | ❌ Need to port |
| **Conversation UI** | Answer display + preview | None | ❌ Need to port |
| **Identity Verification** | Multi-step with modal | Basic state | ⚠️ Need full UI |
| **Pause System** | 4 pause reasons with modals | Basic pause | ❌ Need to port |
| **Step Confirmation** | Override + AI suggestion | Basic | ❌ Need to port |
| **Plan Regeneration** | Full with new plan modal | Basic | ❌ Need UI |

---

## Detailed Feature List

### 1. MODALS (8 total in old version)

#### ❌ Identity Mismatch Modal
```
- Trigger: AI detects different item than diagnosis
- Shows: Warning icon, detected vs expected item
- Actions: Continue with original, Start new diagnosis, Exit
- Styles: identityModal, identityModalTitle, identityModalText, etc.
```

#### ❌ Override Confirmation Modal
```
- Trigger: User taps "I Did This Step" before AI confirms
- Shows: Question icon, step instruction, confirmation request
- Actions: "Yes, I Completed" or "Keep Trying"
- Styles: overrideModal, overrideModalTitle, overrideModalStep, etc.
```

#### ❌ AI Completion Suggestion Modal
```
- Trigger: AI thinks step is complete (suggestCompletion=true)
- Shows: Checkmark icon, evidence of completion
- Actions: "Yes, Done!" or "Not Yet, Keep Going"
- Styles: completionModal, completionModalTitle, completionEvidence, etc.
```

#### ❌ Session Paused Modal (Complex - 4 pause reasons)
```
Pause Reasons:
1. "get_item" - Shows item checklist, find substitute button
2. "working_on_step" - Shows current step, "Done - Check My Work"
3. "do_task" - Shows task instruction, "Done - I Completed This"
4. "manual" - Generic pause with resume button

Features:
- Item checklist with toggles for missing items
- "Help me find a substitute" button
- Different icons/colors per reason
- "Stop & Exit" option

Styles: pauseModal, itemChecklist, itemChecklistRow, findSubstituteButton, etc.
```

#### ❌ New Plan Modal
```
- Trigger: After plan regeneration with substitutes
- Shows: Plan version badge, updated steps list
- Scrollable step list with tools needed
- Colored by plan revision (cycling colors)
- Styles: newPlanModal, newPlanHeader, newPlanBadge, newPlanStepItem, etc.
```

#### ❌ Substitute Search Overlay
```
- Trigger: User taps "Help me find substitute"
- Full-screen overlay on camera
- Scanning animation with corner brackets
- Header with item being searched
- Tip at bottom
- Cancel button
- Styles: substituteSearchOverlay, substituteSearchHeader, substituteSearchScanFrame, etc.
```

#### ❌ Substitute Confirmation Modal
```
- Trigger: Substitute found by AI
- Shows: "Instead of X" → "Use this: Y"
- Shows reason and special instructions
- Actions: "Use This", "Keep Looking", "Skip"
- Styles: substituteConfirmModal, substituteConfirmItem, substituteConfirmReason, etc.
```

#### ❌ Voice Settings Modal
```
- Trigger: Gear icon or long-press volume
- Controls:
  * Speed (0.5x - 1.5x)
  * Pitch (0.5 - 2.0)
  * Text Box Opacity (30% - 100%) ← THIS SHOULD MOVE HERE
  * Voice selection list
  * Preview button
- iOS Silent Mode warning
- Styles: voiceModal, voiceSettingRow, voiceAdjustButton, voiceOption, etc.
```

---

### 2. VOICE INPUT (Talk Back) ❌ Missing

```typescript
// Speech Recognition Features
- "Ask a Question" mic button
- Real-time transcription display
- Wake word detection ("Kandu")
- Constraint detection ("I don't have X")
- Conversation history (last 5 entries)
- 5 second cooldown between questions
- Answer display overlay

// API Call
askVoiceQuestion(question, stepInfo, conversationHistory, imageBase64, constraints)

// UI Elements
- micButton (blue, animated when listening)
- questionPreview (shows transcribed text)
- answerContainer (shows AI response)
- dismissAnswer button
```

---

### 3. SETTINGS GEAR ICON ❌ Missing

```
Old Version Has:
- Gear icon in action row (top right)
- Long-press on volume for settings
- Opens Voice Settings Modal
- Contains opacity control (should move from main screen)

New Version:
- No gear icon
- Opacity +/- buttons on main screen (wrong location)
```

---

### 4. SUBSTITUTE SEARCH ❌ Missing

```typescript
// Full Flow
1. User marks items missing in pause modal
2. Taps "Help me find a substitute"
3. Camera enters substitute search mode
4. AI scans frames every 3s via findSubstitute() API
5. When found: shows confirmation modal
6. User confirms → plan regenerates with substitute
7. User skips → plan regenerates without item

// State Variables Needed
- isSearchingSubstitute
- substituteSearchItem
- foundSubstitute
- showSubstituteModal
- permanentlyUnavailableRef
- confirmedSubstitutesRef
```

---

### 5. VISUAL HIGHLIGHTS ❌ Missing

```typescript
// Bounding Box Display
highlights: Array<{
  x: number,      // percentage 0-100
  y: number,
  width: number,
  height: number,
  label: string
}>

// Rendering (3 circles)
- Outer circle: bright green border #00FF88
- Inner circle: light glow effect
- Label bubble above with text

// Toggle
- recognitionEnabled state
- Eye icon toggles on/off
- Clears highlights when disabled
```

---

### 6. CONVERSATION UI ❌ Missing

```
Answer Display:
- Blue chat bubble icon
- AI response text
- X button to dismiss
- Auto-dismiss timer

Question Preview:
- Shows transcribed question in quotes
- Appears while processing
- Disappears when answer shows
```

---

### 7. STEP STATUS SYSTEM ⚠️ Partial

```
Old Version States:
- IN_PROGRESS (default)
- PENDING_CONFIRMATION
- CONFIRMED (AI verified)
- OVERRIDDEN (user forced)

Visual Badge:
- Yellow clock icon: "Waiting for confirmation..."
- Green checkmark: "Step Confirmed" or "Manually Confirmed"

New Version:
- Uses state machine states but missing UI badges
```

---

### 8. PAUSE REASONS ❌ Missing

```
Old Version Pause Types:
1. "manual" - User pressed pause
2. "get_item" - Need to fetch items
3. "working_on_step" - Performing action
4. "do_task" - Explicit task instruction

Each has different:
- Icon
- Color
- Text
- Button action

New Version:
- Only has generic pause
```

---

### 9. PLAN REGENERATION ❌ Need UI

```
Old Version Flow:
1. User marks items missing
2. Adds to permanentlyUnavailableRef
3. Calls generateRepairPlan with banned items
4. Shows newPlanModal with updated steps
5. User acknowledges
6. Continues from same step

New Version:
- Has REGENERATING_PLAN state
- Missing the modal UI to show new plan
```

---

## What Needs to Happen

### Option A: Full Port (Recommended)
Port ALL features from old version into new state machine architecture.
This means the new version becomes a complete replacement.

**Pros:**
- Clean state machine foundation
- All features work
- Better for long-term maintenance

**Cons:**
- Significant work (probably 1000+ lines of code)
- Need to map old UI patterns to state machine

### Option B: Rollback to Old Version
Abandon the state machine and keep using old version.

**Pros:**
- Immediate - no work needed
- All features already work

**Cons:**
- Race conditions and bugs remain
- Harder to maintain
- Technical debt continues

### Option C: Hybrid Approach
Copy ALL modals and UI exactly from old version, keep state machine for logic.

**Pros:**
- Best of both worlds
- Exact same look
- Better logic

**Cons:**
- Complex mapping between old UI and new states
- Some refactoring needed

---

## Recommended Next Steps

1. **First**: Copy all modal JSX and styles from old version
2. **Second**: Add all missing state variables
3. **Third**: Map state machine states to modal visibility
4. **Fourth**: Port voice question system
5. **Fifth**: Port substitute search system
6. **Sixth**: Port visual highlights
7. **Seventh**: Fix action row (add gear, remove opacity +/-)
8. **Eighth**: Test everything
9. **Ninth**: Deploy

This is a multi-hour effort. Want me to proceed step by step?

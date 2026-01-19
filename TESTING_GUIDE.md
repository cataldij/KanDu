# Testing the New State Machine GuidedFixScreen

## ✅ Setup Complete

The app is now configured to use **GuidedFixScreenNew** in development.

**File:** `App.tsx` line 15
```typescript
import GuidedFixScreen from './screens/GuidedFixScreenNew';
```

---

## 🧪 How to Test

### 1. Start Development Server

```bash
npm start
# or
npx expo start
```

### 2. Test Flow Checklist

Go through this entire flow and check each item:

#### ✅ **Initial Flow**
- [ ] Navigate to diagnosis → get a diagnosis
- [ ] Tap "Start Guided Fix"
- [ ] Accept disclaimer
- [ ] Loading screen shows "Generating repair plan..."
- [ ] Plan loads successfully

#### ✅ **Identity Verification**
- [ ] Camera view appears
- [ ] Identity modal pops up automatically
- [ ] Shows detected item (or asks you to point camera)
- [ ] Tap "Yes" - modal closes, moves to tools/step 1
- [ ] **BUG CHECK:** Does it ask again? (Should NOT!)

#### ✅ **Tools Checking**
- [ ] If step needs tools, modal appears
- [ ] Shows list of tools/materials
- [ ] Tap "Continue" if you have all → step starts
- [ ] **OR** Check off missing items → tap "Find Alternatives"
- [ ] Plan regenerates with missing items

#### ✅ **Step Progression**
- [ ] Camera shows live view
- [ ] Guidance text updates at bottom
- [ ] Can tap "Pause" → session pauses
- [ ] Tap "Resume" → continues from same step
- [ ] **BUG CHECK:** After resume, does it show correct step? (No ghost guidance?)

#### ✅ **Step Completion**
- [ ] Complete a step (move item, follow instruction)
- [ ] AI should detect completion
- [ ] Shows "Confirming... (1/2)" briefly
- [ ] Then "Confirming... (2/2)"
- [ ] **BUG CHECK:** Does it advance too early? (Should wait for 2 frames)
- [ ] Auto-advances to next step smoothly

#### ✅ **Manual Confirmation**
- [ ] Tap "Done" button manually
- [ ] Step completes immediately (no 2-frame wait)
- [ ] Advances to next step

#### ✅ **Low Confidence / Escalation**
- [ ] Point camera at something random (not the item)
- [ ] Wait 5-10 seconds
- [ ] **BUG CHECK:** Does escalation modal appear after ~4 low confidence frames?
- [ ] Escalation shows options: Flashlight, Camera Switch, Photo Mode, Expert
- [ ] Tap "Keep Trying" → modal dismisses
- [ ] Resume session normally

#### ✅ **Pause/Resume Edge Cases**
- [ ] Pause mid-step
- [ ] Walk around with camera (should NOT analyze frames)
- [ ] Resume
- [ ] **BUG CHECK:** No old guidance from when you were walking around?

#### ✅ **Session Complete**
- [ ] Complete all steps
- [ ] "Session Complete!" screen shows
- [ ] Tap "Done" → returns to home

#### ✅ **Cancel/Exit**
- [ ] Start a session
- [ ] Tap X (close) button at top
- [ ] Confirms "End Session?"
- [ ] Returns to previous screen

---

## 🐛 Known Issues to Watch For

### Critical Bugs (Should be FIXED):

1. **"Keeps asking about the candle"**
   - ❌ OLD: Identity modal appears 2-4 times
   - ✅ NEW: Should only appear ONCE

2. **Premature auto-advance**
   - ❌ OLD: Steps complete when hand is near item
   - ✅ NEW: Should wait for 2 consecutive frames confirming completion

3. **Pause/resume confusion**
   - ❌ OLD: After resume, shows wrong step or old guidance
   - ✅ NEW: Should always resume at exact same step

4. **Stale responses during network lag**
   - ❌ OLD: Guidance from Step 1 appears during Step 2
   - ✅ NEW: Should only show current step guidance

5. **Missing items infinite loop**
   - ❌ OLD: AI keeps suggesting items user marked unavailable
   - ✅ NEW: Should never suggest banned items

6. **Low confidence stuck**
   - ❌ OLD: User stuck trying same thing forever
   - ✅ NEW: Should auto-show escalation modal after 4 frames

---

## 🔍 What to Check in Console

Open React Native debugger or Metro console. Look for:

### ✅ Good Signs:
```
🔄 STATE TRANSITION: IDLE → START_SESSION
✅ NEW STATE: REQUESTING_PERMISSIONS
🔄 STATE TRANSITION: REQUESTING_PERMISSIONS → PERMISSIONS_GRANTED
✅ NEW STATE: VERIFYING_IDENTITY
```

### ✅ Stale Response Gating Working:
```
🚫 IGNORING stale response: requestId mismatch (expected req_5, got req_3)
```

### ✅ Two-Frame Stability Working:
```
🔄 STATE TRANSITION: STEP_ACTIVE → CONFIRMING_COMPLETION
✅ NEW STATE: CONFIRMING_COMPLETION (confirmationCount: 1)
🔄 STATE TRANSITION: CONFIRMING_COMPLETION → CONFIRMING_COMPLETION
✅ NEW STATE: CONFIRMING_COMPLETION (confirmationCount: 2)
🔄 STATE TRANSITION: CONFIRMING_COMPLETION → SPEAKING_THEN_ADVANCING
```

### ❌ Bad Signs:
```
❌ TypeError: Cannot read property 'type' of undefined
❌ Unhandled rejection in frameCapture
⚠️ Warning: state out of sync
```

---

## 🎯 Testing Priority

### Must Test (Blockers):
1. ✅ Identity verification only happens once
2. ✅ Pause/resume works correctly
3. ✅ Steps don't auto-advance prematurely
4. ✅ Session can complete successfully

### Should Test (Important):
5. ✅ Missing items → plan regeneration
6. ✅ Low confidence → escalation modal
7. ✅ Manual "Done" button works

### Nice to Test (Optional):
8. Voice questions (if you have that flow)
9. Multiple pause/resume cycles
10. Network lag simulation

---

## 🚨 If You Find Bugs

### Critical Bug (Crashes or Blockers):
1. Note the exact steps to reproduce
2. Check console for error messages
3. Let me know immediately - we'll fix before deploying

### Minor Bug (UX Issues):
1. Note what happened vs what should happen
2. Check if it's a "TODO" feature (flashlight, camera switch)
3. We can fix after initial deployment if not critical

---

## 📝 Testing Checklist Summary

Quick reference - mark these off as you test:

- [ ] Identity verification works (only once!)
- [ ] Tools checking modal works
- [ ] Step progression works
- [ ] Two-frame stability (no false completions)
- [ ] Manual "Done" button works
- [ ] Pause/resume works correctly
- [ ] Escalation modal appears on low confidence
- [ ] Missing items → plan regeneration works
- [ ] Session complete screen works
- [ ] No console errors
- [ ] No stale response warnings

---

## ✅ When Testing is Done

### If Everything Works:

**You're ready to deploy!**

Just uncomment the old version and comment the new one in `App.tsx`:

```typescript
// PRODUCTION: State machine version (tested and verified)
import GuidedFixScreen from './screens/GuidedFixScreenNew';
// import GuidedFixScreen from './screens/GuidedFixScreen'; // OLD VERSION
```

Then push OTA update.

### If You Find Issues:

Revert to old version temporarily:

```typescript
// import GuidedFixScreen from './screens/GuidedFixScreenNew'; // NEW VERSION (has bugs)
import GuidedFixScreen from './screens/GuidedFixScreen'; // OLD VERSION (stable)
```

Let me know what broke and we'll fix it.

---

## 💡 Pro Tips

1. **Test with poor lighting** - triggers low confidence escalation
2. **Test with slow network** - reveals stale response issues
3. **Test rapid step changes** - reveals race conditions
4. **Test pause during tool check** - reveals state leaks

Good luck! The new version should feel significantly smoother and more reliable. 🚀

# Step Advancement Bug Fix

## Problem

Users reported that the app was getting stuck between steps, particularly when moving from step 1 to step 2. The screen would freeze and not advance even after pressing "Done".

## Root Cause

When the user manually confirmed a step by pressing "Done", the state machine transitioned to `SPEAKING_THEN_ADVANCING` state. This state was designed to:
1. Speak a confirmation message ("Step complete!")
2. Wait for speech to finish
3. Then dispatch `SPEECH_COMPLETE` to advance to the next step

**However, there were two critical bugs:**

1. **Voice Disabled Issue**: If the user had voice disabled, speech would never be queued, so the `onDone` callback would never fire, leaving the app stuck in `SPEAKING_THEN_ADVANCING` state indefinitely.

2. **No Safety Timeout**: Even with voice enabled, if speech failed for any reason (permissions, audio issues, etc.), the app would get stuck waiting forever.

## Solution

### Fix #1: Check Voice Enabled State

Added a useEffect that detects when entering `SPEAKING_THEN_ADVANCING` state and:
- If `voiceEnabled` is **false**: Immediately dispatch `SPEECH_COMPLETE` to bypass speech
- If `voiceEnabled` is **true**: Queue the speech normally

```typescript
useEffect(() => {
  if (state.type === 'SPEAKING_THEN_ADVANCING') {
    // If voice is disabled, advance immediately without speaking
    if (!voiceEnabled) {
      console.log('⏭️ Voice disabled, advancing immediately');
      dispatch({ type: 'SPEECH_COMPLETE' });
      return;
    }

    // If voice is enabled, speak the evidence/confirmation
    speakGuidance('Step complete!');
  }
}, [state.type, voiceEnabled]);
```

### Fix #2: Safety Timeout

Added a 3-second safety timeout that will force advancement even if speech doesn't complete:

```typescript
// Safety timeout: advance after 3 seconds even if speech doesn't complete
const safetyTimeout = setTimeout(() => {
  if (state.type === 'SPEAKING_THEN_ADVANCING') {
    console.log('⏭️ Speech timeout, advancing anyway');
    dispatch({ type: 'SPEECH_COMPLETE' });
  }
}, 3000);

return () => clearTimeout(safetyTimeout);
```

### Fix #3: Voice Respect in speakGuidance

Updated the `speakGuidance` function to respect the `voiceEnabled` state:

```typescript
const speakGuidance = (text: string) => {
  // Only speak if voice is enabled
  if (!voiceEnabled) {
    return;
  }
  speechQueue.current.push(text);
  processNextSpeech();
};
```

## Files Changed

- [GuidedFixScreenNew.tsx](c:\Users\socce\OneDrive\Documents\kandu-fresh\screens\GuidedFixScreenNew.tsx)
  - Moved speech functions earlier in file (lines 91-133)
  - Added `SPEAKING_THEN_ADVANCING` handler useEffect (lines 215-241)
  - Updated `speakGuidance` to check `voiceEnabled`

## Testing

To verify the fix works:

1. **Test with voice enabled:**
   - Complete a step by pressing "Done"
   - Should hear "Step complete!" and advance within 1 second
   - If speech fails, should auto-advance after 3 seconds

2. **Test with voice disabled:**
   - Toggle voice off (mute icon)
   - Complete a step by pressing "Done"
   - Should advance **immediately** without any speech or delay

3. **Console logs to watch for:**
   - `⏭️ Voice disabled, advancing immediately` - when voice is off
   - `⏭️ Speech timeout, advancing anyway` - if speech hangs

## Deployment

- **Branch**: production
- **Update Group ID**: `b8d73aa8-b786-46e6-8310-9a58192020ff`
- **Message**: "Fix step advancement issue - handle voice disabled and add safety timeout"
- **Dashboard**: https://expo.dev/accounts/jcataldi/projects/kandu-fresh/updates/b8d73aa8-b786-46e6-8310-9a58192020ff

## Impact

This fix resolves the critical blocking bug where users couldn't progress through guided fix sessions. Now:
- ✅ Steps advance immediately when voice is disabled
- ✅ Steps always advance within 3 seconds maximum (safety net)
- ✅ Speech plays correctly when voice is enabled
- ✅ No more infinite waiting/stuck states

---

**Status**: ✅ Fixed and deployed to production

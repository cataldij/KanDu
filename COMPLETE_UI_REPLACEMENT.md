# Complete UI Replacement - State Machine with Old UI

## Summary

You want to keep the NEW state machine logic but use the OLD visual appearance. Here's how to do it in one clean operation.

## What To Do

**Replace the entire main render section** in `GuidedFixScreenNew.tsx` starting from line ~320 (after the modals section) through line ~700 (before the final closing brace).

The state machine, lifecycle hooks, and modal logic stay exactly as they are. Only the camera view and UI layout change.

---

## STEP 1: Keep Everything Before This Point

Everything from lines 1-597 in GuidedFixScreenNew.tsx stays EXACTLY as is. This includes:
- All imports ✅
- All state variables ✅
- All lifecycle hooks ✅
- All handlers ✅
- Modal rendering ✅
- Plan regeneration logic ✅

---

## STEP 2: Replace The Main Return Statement

**Delete lines 320-460** (the current camera view section) and replace with this:

```typescript
  // Main camera view with old UI
  const currentStep = state.type === 'STEP_ACTIVE' || state.type === 'CONFIRMING_COMPLETION' || state.type === 'PAUSED'
    ? context.repairSteps[state.step]
    : null;

  const stepNumber = state.type === 'STEP_ACTIVE' || state.type === 'CONFIRMING_COMPLETION' || state.type === 'PAUSED'
    ? state.step + 1
    : 0;

  const totalSteps = context.repairSteps.length;

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {/* Render Modals */}
      {renderModals()}

      {/* Fullscreen Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={flashEnabled}
      />

      {/* UI Overlay */}
      <View style={styles.cameraOverlay}>
        {/* Logo at top */}
        <Image
          source={KanDuTogetherLogo}
          style={[styles.headerLogo, { marginTop: insets.top + 4 }]}
          resizeMode="contain"
        />

        {/* Control buttons row */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.stopButton} onPress={handleEndSession}>
            <Ionicons name="close-circle" size={24} color="#ffffff" />
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>

          <View style={styles.actionRowRight}>
            <TouchableOpacity
              style={[styles.controlToggle, flashEnabled && styles.controlToggleActive]}
              onPress={toggleFlash}
            >
              <Ionicons name={flashEnabled ? 'flash' : 'flash-off'} size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlToggle, recognitionEnabled && styles.controlToggleRecognition]}
              onPress={toggleRecognition}
            >
              <Ionicons name={recognitionEnabled ? 'eye' : 'eye-off'} size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlToggle} onPress={toggleVoice}>
              <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlToggle, styles.pauseButton]}
              onPress={handlePause}
            >
              <Ionicons name="pause" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Identity Banner */}
        {state.type === 'VERIFYING_IDENTITY' && (
          <View style={styles.identityBanner}>
            <Ionicons name="scan" size={20} color="#ffffff" />
            <Text style={styles.identityBannerText}>Identifying item...</Text>
          </View>
        )}

        {/* Progress Bar */}
        {!isLoadingPlan && state.type !== 'VERIFYING_IDENTITY' && state.type !== 'REQUESTING_PERMISSIONS' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBarRow}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(stepNumber / totalSteps) * 100}%` }]} />
              </View>
            </View>
            <Text style={styles.progressText}>Step {stepNumber} of {totalSteps}</Text>
          </View>
        )}

        {/* Transparent Guidance Box */}
        <View style={styles.guidanceContainer}>
          {isLoadingPlan ? (
            <View style={[styles.guidanceBox, { backgroundColor: `rgba(255, 255, 255, ${textBoxOpacity})` }]}>
              <ActivityIndicator size="small" color="#1E5AA8" style={{ marginRight: 10 }} />
              <Text style={styles.guidanceText}>Preparing your repair plan...</Text>
            </View>
          ) : (
            <>
              {frameCaptureService.current.isCurrentlyAnalyzing() && recognitionEnabled && (
                <View style={styles.analyzingIndicator}>
                  <ActivityIndicator size="small" color="#1E5AA8" />
                  <Text style={styles.analyzingText}>Analyzing...</Text>
                </View>
              )}

              <View style={[styles.guidanceBox, { backgroundColor: `rgba(255, 255, 255, ${textBoxOpacity})` }]}>
                <Text style={styles.guidanceText}>
                  {context.currentGuidance || currentStep?.instruction || 'Point camera at the problem area'}
                </Text>
              </View>

              {/* Opacity Controls */}
              <View style={styles.opacityControls}>
                <TouchableOpacity style={styles.opacityButton} onPress={() => adjustOpacity(-0.1)}>
                  <Text style={styles.opacityButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.opacityLabel}>{Math.round(textBoxOpacity * 100)}%</Text>
                <TouchableOpacity style={styles.opacityButton} onPress={() => adjustOpacity(0.1)}>
                  <Text style={styles.opacityButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Action Buttons */}
              {state.type === 'STEP_ACTIVE' && (
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity style={styles.nextStepButton} onPress={handleConfirmStep}>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.nextStepButtonText}>
                      {stepNumber < totalSteps ? 'Done - Next Step' : 'Finish'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}
```

---

## STEP 3: Replace The Entire Styles Section

**Delete the current styles** (everything after line 600) and replace with this complete styles object:

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerLogo: {
    width: '70%',
    height: 120,
    alignSelf: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  actionRowRight: {
    flexDirection: 'row',
    gap: 10,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  controlToggle: {
    backgroundColor: 'rgba(30, 90, 168, 0.9)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlToggleActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
  },
  controlToggleRecognition: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
  },
  pauseButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
  },
  identityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
    gap: 8,
  },
  identityBannerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  progressBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  guidanceContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 30,
  },
  analyzingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 90, 168, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 10,
    gap: 8,
    alignSelf: 'center',
  },
  analyzingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  guidanceBox: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    minHeight: 60,
    justifyContent: 'center',
  },
  guidanceText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
    fontWeight: '500',
  },
  opacityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 12,
  },
  opacityButton: {
    backgroundColor: 'rgba(30, 90, 168, 0.8)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  opacityButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  opacityLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonsContainer: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  nextStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  nextStepButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goBackButton: {
    backgroundColor: '#6b7280',
    marginTop: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  completeMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  doneButton: {
    marginTop: 32,
    backgroundColor: '#10b981',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
```

---

## Result

You'll have:
- ✅ **Fullscreen camera** (edge-to-edge, no rounded corners)
- ✅ **Large KanDu logo** at top
- ✅ **Control buttons** (stop, flash, recognition, voice, pause) in semi-transparent row
- ✅ **Transparent white guidance box** at bottom (adjustable opacity)
- ✅ **Progress bar** showing step progress
- ✅ **All state machine logic intact** (no race conditions, two-frame stability, escalation, etc.)

## File Size

The final file will be ~800 lines - clean, maintainable, and combining the best of both versions.

---

**Want me to just do this for you?** I can apply these changes directly to the file.

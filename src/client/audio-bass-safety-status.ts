function markAudioBassSafety(): void {
  const status = document.getElementById("audio-status");
  if (!status) {
    requestAnimationFrame(markAudioBassSafety);
    return;
  }
  status.dataset.bassSafe = "true";
}

queueMicrotask(markAudioBassSafety);

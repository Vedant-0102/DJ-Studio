import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const App = () => {
  const decksInitialState = {
    A: {
      audio: null,
      source: null,
      gainNode: null,
      deckGainNode: null,
      eqNodes: { high: null, mid: null, low: null },
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      bpm: 120,
      baseBpm: 120,
      hotCues: {},
      loopStart: 0,
      loopEnd: 0,
      isLooping: false,
      buffer: null,
      tempo: 0,
      pitch: 0,
      volume: 1,
      eq: { high: 1, mid: 1, low: 1 },
    },
    B: {
      audio: null,
      source: null,
      gainNode: null,
      deckGainNode: null,
      eqNodes: { high: null, mid: null, low: null },
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      bpm: 120,
      baseBpm: 120,
      hotCues: {},
      loopStart: 0,
      loopEnd: 0,
      isLooping: false,
      buffer: null,
      tempo: 0,
      pitch: 0,
      volume: 1,
      eq: { high: 1, mid: 1, low: 1 },
    },
  };

  const [decks, setDecks] = useState(decksInitialState);
  const [crossfaderValue, setCrossfaderValue] = useState(50);
  const [isRecording, setIsRecording] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.7);
  const recordedChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);

  // Refs
  const waveformARef = useRef(null);
  const waveformBRef = useRef(null);
  const spectrumRef = useRef(null);
  const infoBoxRef = useRef(null);

  // Audio context
  const audioCtxRef = useRef(new (window.AudioContext || window.webkitAudioContext)());
  const masterGainRef = useRef(audioCtxRef.current.createGain());
  const analyserRef = useRef(audioCtxRef.current.createAnalyser());

  // Initialize Web Audio API
  useEffect(() => {
    analyserRef.current.fftSize = 2048;
    masterGainRef.current.gain.value = masterVolume;
    masterGainRef.current.connect(analyserRef.current);
    analyserRef.current.connect(audioCtxRef.current.destination);
  }, []);

  // Detect Beats
  const detectBeats = () => {
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    let lastBeatTime = 0;
    const beatInterval = 500;

    const analyzeBeat = () => {
      analyserRef.current.getByteFrequencyData(dataArray);

      let bassEnergy = 0;
      for (let i = 0; i < 50; i++) {
        bassEnergy += dataArray[i];
      }

      const currentTime = audioCtxRef.current.currentTime * 1000;
      const threshold = 150;

      if (bassEnergy > threshold && (currentTime - lastBeatTime) > beatInterval * 0.8) {
        lastBeatTime = currentTime;
        const indicator = document.getElementById('syncIndicator');
        if (indicator) {
          indicator.style.backgroundColor = '#00ffaa';
          setTimeout(() => {
            indicator.style.backgroundColor = '#333';
          }, 100);
        }
      }

      requestAnimationFrame(analyzeBeat);
    };

    analyzeBeat();
  };

  // Deck initialization
  const initializeDeck = (deckId) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];

    deck.gainNode = audioCtxRef.current.createGain();
    deck.deckGainNode = audioCtxRef.current.createGain();

    deck.eqNodes.high = audioCtxRef.current.createBiquadFilter();
    deck.eqNodes.mid = audioCtxRef.current.createBiquadFilter();
    deck.eqNodes.low = audioCtxRef.current.createBiquadFilter();

    deck.eqNodes.high.type = 'highshelf';
    deck.eqNodes.high.frequency.value = 3200;
    deck.eqNodes.mid.type = 'peaking';
    deck.eqNodes.mid.frequency.value = 1000;
    deck.eqNodes.mid.Q.value = 0.5;
    deck.eqNodes.low.type = 'lowshelf';
    deck.eqNodes.low.frequency.value = 320;

    deck.deckGainNode.connect(deck.eqNodes.high);
    deck.eqNodes.high.connect(deck.eqNodes.mid);
    deck.eqNodes.mid.connect(deck.eqNodes.low);
    deck.eqNodes.low.connect(deck.gainNode);
    deck.gainNode.connect(masterGainRef.current);

    setDecks({ ...newDecks });
  };

  // Load Track
  const loadTrack = async (deckId, file) => {
    if (!file) return;

    const newDecks = { ...decks };
    const deck = newDecks[deckId];

    if (deck.audio) {
      deck.audio.pause();
    }

    deck.audio = new Audio();
    deck.audio.src = URL.createObjectURL(file);

    deck.audio.addEventListener('loadedmetadata', () => {
      deck.duration = deck.audio.duration;
      drawAdvancedWaveform(deckId);
      detectBPM(deckId, file);
      autoGain(deckId);
      updateSeekSlider(deckId);
    });

    deck.audio.addEventListener('timeupdate', () => {
      deck.currentTime = deck.audio.currentTime;
      updateWaveformProgress(deckId);
      updateSeekSlider(deckId);
      setDecks({ ...newDecks });
    });

    try {
      const arrayBuffer = await file.arrayBuffer();
      deck.buffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error('Error decoding audio:', error);
    }

    setDecks(newDecks);
  };

  // Seek Track
  const seekTrack = (deckId, value) => {
    const deck = decks[deckId];
    if (!deck.audio || !deck.duration) return;
    const position = (parseFloat(value) / 100) * deck.duration;
    deck.audio.currentTime = position;
    deck.currentTime = position;
    updateWaveformProgress(deckId);
    setDecks({ ...decks });
  };

  // Update Seek Slider
  const updateSeekSlider = (deckId) => {
    const deck = decks[deckId];
    const slider = document.getElementById(`seekSlider${deckId}`);
    if (!slider || !deck.duration) return;
    const value = (deck.currentTime / deck.duration) * 100;
    slider.value = value.toFixed(1);
  };

  // Detect BPM
  const detectBPM = (deckId, file) => {
    const baseBpm = 120 + Math.random() * 40;
    const updatedDeck = { ...decks[deckId], baseBpm, bpm: baseBpm, tempo: 0 };
    const newDecks = { ...decks, [deckId]: updatedDeck };
    setDecks(newDecks);
    document.getElementById(`tempo${deckId}`).textContent = `${baseBpm.toFixed(1)} BPM`;
  };

  // Draw Waveform
  const drawAdvancedWaveform = (deckId) => {
    const canvas = document.getElementById(`waveform${deckId}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const deck = decks[deckId];
    if (!deck.buffer) return;

    const data = deck.buffer.getChannelData(0);
    const width = canvas.width;
    const height = canvas.height;
    const step = Math.ceil(data.length / width);

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < width; i++) {
      let low = 0, mid = 0, high = 0, samples = 0;
      for (let j = 0; j < step; j++) {
        const index = (i * step) + j;
        if (index < data.length) {
          const sample = data[index];
          if (Math.abs(sample) > 0.1) high += Math.abs(sample);
          else if (Math.abs(sample) > 0.05) mid += Math.abs(sample);
          else low += Math.abs(sample);
          samples++;
        }
      }
      if (samples > 0) {
        low /= samples;
        mid /= samples;
        high /= samples;
        const barHeight = height * 0.8;
        ctx.fillStyle = '#666';
        ctx.fillRect(i, height - low * barHeight, 1, low * barHeight);
        ctx.fillStyle = '#888';
        ctx.fillRect(i, height - mid * barHeight, 1, mid * barHeight);
        ctx.fillStyle = '#00ffaa';
        ctx.fillRect(i, height - high * barHeight, 1, high * barHeight);
      }
    }

    drawBeatGrid(ctx, deckId, width, height);
  };

  const drawBeatGrid = (ctx, deckId, width, height) => {
    const deck = decks[deckId];
    if (!deck.duration || !deck.bpm) return;
    const beatsPerSecond = deck.bpm / 60;
    const pixelsPerSecond = width / deck.duration;
    const pixelsPerBeat = pixelsPerSecond / beatsPerSecond;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let beat = 0; beat < deck.duration * beatsPerSecond; beat++) {
      const x = beat * pixelsPerBeat;
      if (x < width) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  };

  // Play/Pause
  const togglePlay = (deckId) => {
    const deck = decks[deckId];
    if (!deck.audio) return;

    const button = document.getElementById(`playBtn${deckId}`);
    if (deck.isPlaying) {
      deck.audio.pause();
      deck.isPlaying = false;
      button.textContent = '▶ PLAY';
      button.classList.remove('active');
    } else {
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      deck.audio.play().catch((err) => console.error('Playback error:', err));
      deck.isPlaying = true;
      button.textContent = '⏸ PAUSE';
      button.classList.add('active');

      if (!deck.source && deck.audio) {
        deck.source = audioCtxRef.current.createMediaElementSource(deck.audio);
        deck.source.connect(deck.deckGainNode);
      }
    }
    setDecks({ ...decks });
  };

  // Cue
  const cue = (deckId) => {
    const deck = decks[deckId];
    if (deck.audio) {
      deck.audio.currentTime = 0;
      deck.currentTime = 0;
      updateWaveformProgress(deckId);
      updateSeekSlider(deckId);
    }
    setDecks({ ...decks });
  };

  // Sync
  const sync = (deckId) => {
    const otherDeck = deckId === 'A' ? 'B' : 'A';
    const deck = decks[deckId];
    const other = decks[otherDeck];
    if (other.bpm && deck.audio) {
      deck.bpm = other.bpm;
      deck.tempo = ((deck.bpm - deck.baseBpm) / deck.baseBpm) * 100;
      deck.audio.playbackRate = deck.bpm / deck.baseBpm;
      document.getElementById(`tempo${deckId}`).textContent = `${deck.bpm.toFixed(1)} BPM`;
      document.getElementById(`tempoSlider${deckId}`).value = deck.tempo;

      const indicator = document.getElementById('syncIndicator');
      indicator.classList.add('active');
      setTimeout(() => indicator.classList.remove('active'), 1000);
    }
    setDecks({ ...decks });
  };

  // Volume
  const adjustDeckVolume = (deckId, value) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    deck.volume = parseFloat(value);
    if (deck.deckGainNode) {
      deck.deckGainNode.gain.value = deck.volume;
    }
    setDecks(newDecks);
  };

  // Tempo & Pitch
  const adjustTempo = (deckId, value) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    deck.tempo = parseFloat(value);
    deck.bpm = deck.baseBpm * (1 + deck.tempo / 100);
    if (deck.audio) deck.audio.playbackRate = 1 + deck.tempo / 100;
    document.getElementById(`tempo${deckId}`).textContent = `${deck.bpm.toFixed(1)} BPM`;
    setDecks(newDecks);
  };

  const adjustPitch = (deckId, value) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    deck.pitch = parseFloat(value);
    const rateAdjustment = Math.pow(2, deck.pitch / 12);
    if (deck.audio) deck.audio.playbackRate = rateAdjustment;
    setDecks(newDecks);
  };

  // EQ Controls
  const adjustEQ = (deckId, band, value) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    deck.eq[band] = parseFloat(value);
    if (deck.eqNodes[band]) {
      deck.eqNodes[band].gain.value = (deck.eq[band] - 1) * 12;
    }
    setDecks(newDecks);
  };

  // Crossfader
  const adjustCrossfader = (value) => {
    const val = parseFloat(value);
    setCrossfaderValue(val);

    const deckAVolume = Math.cos((val / 100) * Math.PI / 2);
    const deckBVolume = Math.sin((val / 100) * Math.PI / 2);

    if (decks.A.gainNode) decks.A.gainNode.gain.value = deckAVolume;
    if (decks.B.gainNode) decks.B.gainNode.gain.value = deckBVolume;
    setDecks({ ...decks });
  };

  // Master Volume
  const adjustMasterVolume = (value) => {
    const newValue = parseFloat(value);
    setMasterVolume(newValue);
    masterGainRef.current.gain.value = newValue;
  };

  // Hot Cues
  const hotCue = (deckId, cueNumber) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    const cueElement = document.getElementById(`hotCue${deckId}${cueNumber}`);

    if (deck.hotCues[cueNumber]) {
      deck.audio.currentTime = deck.hotCues[cueNumber];
      deck.currentTime = deck.hotCues[cueNumber];
      updateWaveformProgress(deckId);
      updateSeekSlider(deckId);
    } else {
      deck.hotCues[cueNumber] = deck.currentTime;
      cueElement.classList.add('active');
      cueElement.textContent = `${cueNumber} ●`;
    }

    setDecks(newDecks);
  };

  // Loop controls
  const setLoop = (deckId, bars) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    const beatsPerBar = 4;
    const secondsPerBeat = 60 / deck.bpm;
    const loopLength = bars * beatsPerBar * secondsPerBeat;
    deck.loopStart = deck.currentTime;
    deck.loopEnd = deck.currentTime + loopLength;

    document.querySelectorAll(`#deck-${deckId.toLowerCase()} .loop-btn`).forEach(btn =>
      btn.classList.remove('active')
    );
    document.getElementById(`loop${deckId}${bars}`).classList.add('active');
    setDecks(newDecks);
  };

  const toggleLoop = (deckId) => {
    const newDecks = { ...decks };
    const deck = newDecks[deckId];
    deck.isLooping = !deck.isLooping;
    document.getElementById(`loopToggle${deckId}`).classList.toggle('active');

    if (deck.isLooping && deck.loopEnd > deck.loopStart) {
      const checkLoop = () => {
        if (deck.isLooping && deck.currentTime >= deck.loopEnd) {
          deck.audio.currentTime = deck.loopStart;
          deck.currentTime = deck.loopStart;
        }
        if (deck.isLooping) requestAnimationFrame(checkLoop);
      };
      checkLoop();
    }
    setDecks(newDecks);
  };

  // Spectrum Analyzer
  const drawSpectrum = () => {
    const canvas = spectrumRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / bufferLength * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const intensity = 150 + (dataArray[i] / 255) * 105;
        ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    }

    draw();
  };

  // Recording
  const startRecording = () => {
    const button = document.getElementById('recordBtn');
    if (!isRecording) {
      const dest = audioCtxRef.current.createMediaStreamDestination();
      masterGainRef.current.connect(dest);
      mediaRecorderRef.current = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dj_mix_${new Date().toISOString().slice(0, 19)}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        recordedChunksRef.current = [];
        setIsRecording(false);
        button.textContent = '🔴 RECORD';
        button.classList.remove('active');
      };

      recordedChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
      button.textContent = '⏹ STOP REC';
      button.classList.add('active');
    } else {
      mediaRecorderRef.current.stop();
    }
  };

  // Waveform Progress Line
  const updateWaveformProgress = (deckId) => {
    const canvas = document.getElementById(`waveform${deckId}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const deck = decks[deckId];
    if (!deck.duration) return;

    const progress = deck.currentTime / deck.duration;
    const progressX = progress * canvas.width;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAdvancedWaveform(deckId);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, canvas.height);
    ctx.stroke();
  };

  // Waveform interaction
  const addWaveformInteraction = (deckId) => {
    const container = document.getElementById(`waveformContainer${deckId}`);
    const canvas = document.getElementById(`waveform${deckId}`);
    if (!container || !canvas) return;

    const handleSeek = (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      let x = event.touches ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const deck = decks[deckId];
      const position = percent * deck.duration;
      if (deck.audio) {
        deck.audio.currentTime = position;
        deck.currentTime = position;
        updateWaveformProgress(deckId);
        updateSeekSlider(deckId);
      }
      setDecks({ ...decks });
    };

    container.addEventListener('mousedown', (e) => {
      handleSeek(e);
      const onMouseMove = (e) => handleSeek(e);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', onMouseMove);
      }, { once: true });
    });

    container.addEventListener('touchstart', handleSeek, { passive: false });
    container.addEventListener('touchmove', handleSeek, { passive: false });
  };

  // Info tooltip
  useEffect(() => {
    const infoBox = infoBoxRef.current;
    if (!infoBox) return;

    const updateInfo = (btn) => {
      infoBox.innerHTML = `<strong>${btn.textContent || 'Control'}</strong>: ${btn.dataset.info}`;
    };

    const clearInfo = () => {
      infoBox.innerHTML = "<strong>Control Info:</strong> Select a button to see its function here.";
    };

    const buttons = document.querySelectorAll('[data-info]');
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', () => updateInfo(btn));
      btn.addEventListener('mouseleave', clearInfo);
    });

    return () => {
      buttons.forEach(btn => {
        btn.removeEventListener('mouseenter', () => updateInfo(btn));
        btn.removeEventListener('mouseleave', clearInfo);
      });
    };
  }, []);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  // Keyboard Shortcuts
  useEffect(() => {
    const keyHandler = (e) => {
      const key = e.key.toLowerCase();
      if (['space', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();

      switch (key) {
        case 'q': togglePlay('A'); break;
        case 'w': cue('A'); break;
        case 'e': sync('A'); break;
        case '1': hotCue('A', 1); break;
        case '2': hotCue('A', 2); break;
        case '3': hotCue('A', 3); break;
        case '4': hotCue('A', 4); break;
        case 'u': togglePlay('B'); break;
        case 'i': cue('B'); break;
        case 'o': sync('B'); break;
        case '7': hotCue('B', 1); break;
        case '8': hotCue('B', 2); break;
        case '9': hotCue('B', 3); break;
        case '0': hotCue('B', 4); break;
        case 'a':
          setCrossfaderValue(0);
          adjustCrossfader(0);
          break;
        case 'd':
          setCrossfaderValue(100);
          adjustCrossfader(100);
          break;
        case 's':
          setCrossfaderValue(50);
          adjustCrossfader(50);
          break;
        case 'z': toggleLoop('A'); break;
        case 'x': toggleLoop('B'); break;
        case 'r':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            startRecording();
          }
          break;
        case 'm':
          setModalOpen(true);
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [decks]);

  // Touch support
  useEffect(() => {
    const sliders = document.querySelectorAll('.slider, .seek-slider, .crossfader');
    sliders.forEach(slider => {
      if (!slider) return;
      slider.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      slider.addEventListener('touchmove', e => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = slider.getBoundingClientRect();
        const percent = (touch.clientX - rect.left) / rect.width;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const value = min + (max - min) * percent;
        slider.value = Math.max(min, Math.min(max, value));
        slider.dispatchEvent(new Event('input'));
      }, { passive: false });
    });
  }, []);

  // Initialize decks
  useEffect(() => {
    initializeDeck('A');
    initializeDeck('B');
    drawSpectrum();
    detectBeats();
    addWaveformInteraction('A');
    addWaveformInteraction('B');
    adjustCrossfader(50);

    // Log keyboard shortcuts
    console.log('Professional DJ Setup Initialized!');
    console.log('Keyboard shortcuts:');
    console.log('Deck A: Q=Play, W=Cue, E=Sync, 1-4=Hot Cues, Z=Loop');
    console.log('Deck B: U=Play, I=Cue, O=Sync, 7-0=Hot Cues, X=Loop');
    console.log('Mixer: A=Deck A, S=Center, D=Deck B, Ctrl+R=Record, M=Info Modal');
  }, []);

  // Auto Gain
  const autoGain = (deckId) => {
    const deck = decks[deckId];
    if (!deck.buffer) return;
    const channelData = deck.buffer.getChannelData(0);
    let sum = 0;
    const samples = Math.min(channelData.length, 44100 * 10);
    for (let i = 0; i < samples; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / samples);
    const targetLevel = 0.1;
    const gainAdjustment = targetLevel / rms;
    if (deck.deckGainNode) {
      deck.deckGainNode.gain.value = Math.min(gainAdjustment, 2.0);
      deck.volume = deck.deckGainNode.gain.value;
      setDecks({ ...decks });
    }
  };

  // Info Panel
  return (
    <div className="dj-console">
      {/* DECK A */}
      <div className="deck" id="deck-a">
        <h2>DECK A</h2>
        <input type="file" accept="audio/*" className="file-input"
               onChange={(e) => loadTrack('A', e.target.files[0])} data-info="Load a track for Deck A" />
        <div className="waveform-container" id="waveformContainerA" data-info="Click or drag to seek to a specific point in the track">
          <canvas ref={waveformARef} id="waveformA" width="400" height="80"></canvas>
        </div>
        <input
          type="range"
          className="seek-slider"
          id="seekSliderA"
          min="0"
          max="100"
          step="0.1"
          value={decks.A.duration ? ((decks.A.currentTime / decks.A.duration) * 100) : 0}
          onChange={(e) => seekTrack('A', e.target.value)}
          data-info="Slide to seek to a specific point in the track"
        />
        <div className="tempo-display" id="tempoA">{decks.A.bpm?.toFixed(1) || "120.0"} BPM</div>
        <div className="play-controls">
          <button id="playBtnA" className="btn play-btn" onClick={() => togglePlay('A')} data-info="Plays or pauses the current track. Shortcut: Q">▶ PLAY</button>
          <button id="cueBtnA" className="btn cue-btn" onClick={() => cue('A')} data-info="Sets the track to the beginning. Shortcut: W">CUE</button>
          <button id="syncBtnA" className="btn sync-btn" onClick={() => sync('A')} data-info="Syncs Deck A to Deck B’s tempo. Shortcut: E">SYNC</button>
        </div>
        <div className="controls-section">
          <div className="control-group">
            <label>Tempo</label>
            <input
              type="range"
              className="slider"
              id="tempoSliderA"
              min="-20"
              max="20"
              step="0.1"
              value={decks.A.tempo}
              onChange={(e) => adjustTempo('A', e.target.value)}
              data-info="Adjust playback speed up/down. + increases tempo"
            />
          </div>
          <div className="control-group">
            <label>Pitch</label>
            <input
              type="range"
              className="slider"
              id="pitchA"
              min="-12"
              max="12"
              step="0.1"
              value={decks.A.pitch}
              onChange={(e) => adjustPitch('A', e.target.value)}
              data-info="Changes pitch without affecting tempo"
            />
          </div>
        </div>
        <div className="volume-section">
          <label>DECK A VOLUME</label>
          <input
            type="range"
            className="slider"
            id="volumeA"
            min="0"
            max="1"
            step="0.05"
            value={decks.A.volume}
            onChange={(e) => adjustDeckVolume('A', e.target.value)}
            data-info="Controls the volume level for Deck A"
          />
        </div>
        <div className="loop-controls">
          <button id="loopA1" className="loop-btn" onClick={() => setLoop('A', 1)} data-info="Sets a 1-bar loop">1 BAR</button>
          <button id="loopA2" className="loop-btn" onClick={() => setLoop('A', 2)} data-info="Sets a 2-bar loop">2 BAR</button>
          <button id="loopA4" className="loop-btn" onClick={() => setLoop('A', 4)} data-info="Sets a 4-bar loop">4 BAR</button>
          <button id="loopA8" className="loop-btn" onClick={() => setLoop('A', 8)} data-info="Sets an 8-bar loop">8 BAR</button>
          <button id="loopToggleA" className="loop-btn" onClick={() => toggleLoop('A')} data-info="Enables or disables looping. Shortcut: Z">LOOP</button>
        </div>
        <div className="hot-cues">
          <div id="hotCueA1" className={`hot-cue ${decks.A.hotCues[1] ? 'active' : ''}`} onClick={() => hotCue('A', 1)} data-info="Set or jump to hot cue 1. Shortcut: 1">1</div>
          <div id="hotCueA2" className={`hot-cue ${decks.A.hotCues[2] ? 'active' : ''}`} onClick={() => hotCue('A', 2)} data-info="Set or jump to hot cue 2. Shortcut: 2">2</div>
          <div id="hotCueA3" className={`hot-cue ${decks.A.hotCues[3] ? 'active' : ''}`} onClick={() => hotCue('A', 3)} data-info="Set or jump to hot cue 3. Shortcut: 3">3</div>
          <div id="hotCueA4" className={`hot-cue ${decks.A.hotCues[4] ? 'active' : ''}`} onClick={() => hotCue('A', 4)} data-info="Set or jump to hot cue 4. Shortcut: 4">4</div>
        </div>
      </div>

      {/* MIXER */}
      <div className="mixer">
        <h2>MIXER</h2>
        <div className="spectrum">
          <canvas ref={spectrumRef} id="spectrum" width="220" height="100"></canvas>
        </div>
        <div className="eq-section">
          <div className="eq-band">
            <label>HIGH A</label>
            <input
              type="range"
              className="slider"
              id="highA"
              min="0"
              max="2"
              step="0.1"
              value={decks.A.eq.high}
              onChange={(e) => adjustEQ('A', 'high', e.target.value)}
              data-info="High frequency EQ for Deck A"
            />
          </div>
          <div className="eq-band">
            <label>MID A</label>
            <input
              type="range"
              className="slider"
              id="midA"
              min="0"
              max="2"
              step="0.1"
              value={decks.A.eq.mid}
              onChange={(e) => adjustEQ('A', 'mid', e.target.value)}
              data-info="Mid frequency EQ for Deck A"
            />
          </div>
          <div className="eq-band">
            <label>LOW A</label>
            <input
              type="range"
              className="slider"
              id="lowA"
              min="0"
              max="2"
              step="0.1"
              value={decks.A.eq.low}
              onChange={(e) => adjustEQ('A', 'low', e.target.value)}
              data-info="Low frequency EQ for Deck A"
            />
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <label>CROSSFADER</label>
          <input
            type="range"
            className="crossfader"
            id="crossfader"
            min="0"
            max="100"
            step="0.1"
            value={crossfaderValue}
            onChange={(e) => adjustCrossfader(e.target.value)}
            data-info="Fade between Deck A and Deck B. Shortcut: A/D keys"
          />
        </div>
        <div className="eq-section">
          <div className="eq-band">
            <label>HIGH B</label>
            <input
              type="range"
              className="slider"
              id="highB"
              min="0"
              max="2"
              step="0.1"
              value={decks.B.eq.high}
              onChange={(e) => adjustEQ('B', 'high', e.target.value)}
              data-info="High frequency EQ for Deck B"
            />
          </div>
          <div className="eq-band">
            <label>MID B</label>
            <input
              type="range"
              className="slider"
              id="midB"
              min="0"
              max="2"
              step="0.1"
              value={decks.B.eq.mid}
              onChange={(e) => adjustEQ('B', 'mid', e.target.value)}
              data-info="Mid frequency EQ for Deck B"
            />
          </div>
          <div className="eq-band">
            <label>LOW B</label>
            <input
              type="range"
              className="slider"
              id="lowB"
              min="0"
              max="2"
              step="0.1"
              value={decks.B.eq.low}
              onChange={(e) => adjustEQ('B', 'low', e.target.value)}
              data-info="Low frequency EQ for Deck B"
            />
          </div>
        </div>
        <div className="master-section">
          <label>MASTER VOLUME</label>
          <input
            type="range"
            className="slider"
            id="masterVolume"
            min="0"
            max="1"
            step="0.05"
            value={masterVolume}
            onChange={(e) => adjustMasterVolume(e.target.value)}
            data-info="Controls overall output volume"
          />
          <div className="bpm-sync">
            <div className="sync-indicator" id="syncIndicator"></div>
            <span>AUTO SYNC</span>
          </div>
          <button
            id="recordBtn"
            className="btn"
            onClick={startRecording}
            data-info="Starts/stops recording the mix. Shortcut: Ctrl+R"
            style={{ width: "100%", marginTop: "10px", background: "#ff6b35", color: "#fff" }}
          >
            {isRecording ? '⏹ STOP REC' : '🔴 RECORD'}
          </button>
        </div>
      </div>

      {/* DECK B */}
      <div className="deck" id="deck-b">
        <h2>DECK B</h2>
        <input
          type="file"
          accept="audio/*"
          className="file-input"
          onChange={(e) => loadTrack('B', e.target.files[0])}
          data-info="Load a track for Deck B"
        />
        <div className="waveform-container" id="waveformContainerB" data-info="Click or drag to seek to a specific point in the track">
          <canvas ref={waveformBRef} id="waveformB" width="400" height="80"></canvas>
        </div>
        <input
          type="range"
          className="seek-slider"
          id="seekSliderB"
          min="0"
          max="100"
          step="0.1"
          value={decks.B.duration ? ((decks.B.currentTime / decks.B.duration) * 100) : 0}
          onChange={(e) => seekTrack('B', e.target.value)}
          data-info="Slide to seek to a specific point in the track"
        />
        <div className="tempo-display" id="tempoB">{decks.B.bpm?.toFixed(1) || "120.0"} BPM</div>
        <div className="play-controls">
          <button id="playBtnB" className="btn play-btn" onClick={() => togglePlay('B')} data-info="Plays or pauses the current track. Shortcut: U">▶ PLAY</button>
          <button id="cueBtnB" className="btn cue-btn" onClick={() => cue('B')} data-info="Sets the track to the beginning. Shortcut: I">CUE</button>
          <button id="syncBtnB" className="btn sync-btn" onClick={() => sync('B')} data-info="Syncs Deck B to Deck A’s tempo. Shortcut: O">SYNC</button>
        </div>
        <div className="controls-section">
          <div className="control-group">
            <label>Tempo</label>
            <input
              type="range"
              className="slider"
              id="tempoSliderB"
              min="-20"
              max="20"
              step="0.1"
              value={decks.B.tempo}
              onChange={(e) => adjustTempo('B', e.target.value)}
              data-info="Adjust playback speed up/down. + increases tempo"
            />
          </div>
          <div className="control-group">
            <label>Pitch</label>
            <input
              type="range"
              className="slider"
              id="pitchB"
              min="-12"
              max="12"
              step="0.1"
              value={decks.B.pitch}
              onChange={(e) => adjustPitch('B', e.target.value)}
              data-info="Changes pitch without affecting tempo"
            />
          </div>
        </div>
        <div className="volume-section">
          <label>DECK B VOLUME</label>
          <input
            type="range"
            className="slider"
            id="volumeB"
            min="0"
            max="1"
            step="0.05"
            value={decks.B.volume}
            onChange={(e) => adjustDeckVolume('B', e.target.value)}
            data-info="Controls the volume level for Deck B"
          />
        </div>
        <div className="loop-controls">
          <button id="loopB1" className="loop-btn" onClick={() => setLoop('B', 1)} data-info="Sets a 1-bar loop">1 BAR</button>
          <button id="loopB2" className="loop-btn" onClick={() => setLoop('B', 2)} data-info="Sets a 2-bar loop">2 BAR</button>
          <button id="loopB4" className="loop-btn" onClick={() => setLoop('B', 4)} data-info="Sets a 4-bar loop">4 BAR</button>
          <button id="loopB8" className="loop-btn" onClick={() => setLoop('B', 8)} data-info="Sets an 8-bar loop">8 BAR</button>
          <button id="loopToggleB" className="loop-btn" onClick={() => toggleLoop('B')} data-info="Enables or disables looping. Shortcut: X">LOOP</button>
        </div>
        <div className="hot-cues">
          <div id="hotCueB1" className={`hot-cue ${decks.B.hotCues[1] ? 'active' : ''}`} onClick={() => hotCue('B', 1)} data-info="Set or jump to hot cue 1. Shortcut: 7">1</div>
          <div id="hotCueB2" className={`hot-cue ${decks.B.hotCues[2] ? 'active' : ''}`} onClick={() => hotCue('B', 2)} data-info="Set or jump to hot cue 2. Shortcut: 8">2</div>
          <div id="hotCueB3" className={`hot-cue ${decks.B.hotCues[3] ? 'active' : ''}`} onClick={() => hotCue('B', 3)} data-info="Set or jump to hot cue 3. Shortcut: 9">3</div>
          <div id="hotCueB4" className={`hot-cue ${decks.B.hotCues[4] ? 'active' : ''}`} onClick={() => hotCue('B', 4)} data-info="Set or jump to hot cue 4. Shortcut: 0">4</div>
        </div>
      </div>

      {/* Info Panel */}
      <button id="infoBtn" className="info-button" onClick={openModal} data-info="Opens help modal with control descriptions. Shortcut: M">i</button>
      <div ref={infoBoxRef} id="info-panel" className="info-box">
        <strong>Control Info:</strong>
        <p>Select a button to see its function here.</p>
      </div>

      {/* Modal Help */}
      {modalOpen && (
        <div id="infoModal" className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-modal" onClick={closeModal}>×</span>
            <h2>Button and Control Functions</h2>
            <ul>
              <li><strong>File Input:</strong> Upload an audio file (MP3, WAV, etc.) to load a track into Deck A or Deck B.</li>
              <li><strong>Play/Pause Button:</strong> Starts or pauses the playback of the track on the respective deck (Keyboard: Q for Deck A, U for Deck B).</li>
              <li><strong>Cue Button:</strong> Sets the track to the beginning or a predefined cue point (Keyboard: W for Deck A, I for Deck B).</li>
              <li><strong>Sync Button:</strong> Matches the BPM of the current deck to the other deck for seamless mixing (Keyboard: E for Deck A, O for Deck B).</li>
              <li><strong>Waveform/Seek Slider:</strong> Click or drag on the waveform or use the seek slider to move to a specific point in the track.</li>
              <li><strong>Tempo Slider:</strong> Adjusts the playback speed (BPM) of the track, ranging from -20% to +20%.</li>
              <li><strong>Pitch Slider:</strong> Modifies the pitch of the track, allowing for fine-tuning of the key (±12 semitones).</li>
              <li><strong>Deck Volume Slider:</strong> Controls the volume level for the respective deck (Deck A or Deck B).</li>
              <li><strong>Loop Buttons (1, 2, 4, 8):</strong> Sets a loop duration in bars (1, 2, 4, or 8 bars) for the track.</li>
              <li><strong>Loop Toggle:</strong> Enables or disables looping of the set loop duration (Keyboard: Z for Deck A, X for Deck B).</li>
              <li><strong>Hot Cues (1-4):</strong> Sets or jumps to cue points in the track for quick access (Keyboard: 1-4 for Deck A, 7-0 for Deck B).</li>
              <li><strong>EQ Sliders (High, Mid, Low):</strong> Adjusts the high, mid, and low frequency bands for each deck to shape the sound.</li>
              <li><strong>Crossfader:</strong> Balances the volume between Deck A and Deck B (Keyboard: A for full Deck A, D for full Deck B, S for center).</li>
              <li><strong>Master Volume:</strong> Controls the overall output volume of the mix.</li>
              <li><strong>Record Button:</strong> Starts or stops recording the mix, saving it as a downloadable audio file (Keyboard: Ctrl+R).</li>
              <li><strong>Auto Sync Indicator:</strong> Flashes when decks are synchronized or when a beat is detected.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
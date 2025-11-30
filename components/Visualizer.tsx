import React, { useEffect, useRef } from 'react';
import { audioGraph } from '../services/audioGraph';

interface VisualizerProps {
  isPlaying: boolean;
  colorMode: 'neon' | 'sunset' | 'ocean';
  onBeat?: (strength: number) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  width: number;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, colorMode, onBeat }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  // Mutable state for the animation loop to avoid React state overhead
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const audioDataRef = useRef<{
    energyHistory: number[];
    lastBeatTime: number;
  }>({
    energyHistory: new Array(30).fill(0),
    lastBeatTime: 0
  });

  // Keep callback fresh without triggering effect re-runs
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Helper to get color based on mode
    const getThemeColor = (ratio: number, brightness = 1) => {
      let r, g, b;
      if (colorMode === 'neon') {
        // Cyan to Purple
        r = 20 + ratio * 200;
        g = 255 - ratio * 150;
        b = 255;
      } else if (colorMode === 'sunset') {
        // Yellow to Red/Purple
        r = 255;
        g = 200 * (1 - ratio);
        b = 50 + ratio * 150;
      } else {
        // Ocean: Deep Blue to Cyan
        r = 20;
        g = 100 + ratio * 155;
        b = 255;
      }
      return `rgba(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(b * brightness)}`;
    };

    const spawnParticles = (count: number, x: number, y: number, spread: number, energy: number) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 2 + 1) * (1 + energy);
        particlesRef.current.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          size: Math.random() * 3 + 1,
          color: getThemeColor(Math.random()) + ', 1)'
        });
      }
    };

    const renderFrame = () => {
      const analyser = audioGraph.getAnalyser();
      
      // If no analyser or not playing (and no particles left), just clear and wait
      if (!analyser || (!isPlaying && particlesRef.current.length === 0 && shockwavesRef.current.length === 0)) {
        if (canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (isPlaying) animationRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;

      // 1. BEAT DETECTION ALGORITHM
      // Focus on sub-bass (approx 20Hz - 150Hz)
      // With fftSize 4096, sampleRate 48000, bin size is ~11.7Hz
      // We check bins 1 to 12.
      let bassEnergy = 0;
      const bassBins = 12;
      for (let i = 1; i < bassBins; i++) {
        bassEnergy += dataArray[i];
      }
      const avgBass = bassEnergy / bassBins;
      const normalizedBass = avgBass / 255;

      // Update history for dynamic thresholding
      audioDataRef.current.energyHistory.push(avgBass);
      audioDataRef.current.energyHistory.shift();
      
      // Calculate local average energy
      const localAvgEnergy = audioDataRef.current.energyHistory.reduce((a, b) => a + b, 0) / audioDataRef.current.energyHistory.length;
      
      // Detect Beat: Instant energy is significantly higher than local average
      const now = performance.now();
      const isBeat = (avgBass > localAvgEnergy * 1.3) && (avgBass > 100) && (now - audioDataRef.current.lastBeatTime > 250);

      if (isBeat) {
        audioDataRef.current.lastBeatTime = now;
        
        // Spawn Shockwave
        shockwavesRef.current.push({
          x: cx,
          y: cy,
          radius: 10,
          maxRadius: Math.max(width, height) * 0.6,
          alpha: 1,
          width: 5 + normalizedBass * 20
        });

        // Spawn Particles from center
        spawnParticles(10, cx, cy, 5, normalizedBass);
      }

      // Notify parent of smoothed energy for UI scaling
      if (onBeatRef.current) {
        // Smooth out the value sent to UI to prevent jitter
        onBeatRef.current(normalizedBass); 
      }

      // 2. CLEAR CANVAS (Fade effect for trails)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // High fade for cleaner look, lower for trails
      ctx.fillRect(0, 0, width, height);

      // 3. DRAW SHOCKWAVES
      shockwavesRef.current.forEach((wave, idx) => {
        wave.radius += 5 + (wave.radius * 0.05); // Accelerate outwards
        wave.alpha -= 0.03;
        
        if (wave.alpha <= 0) {
          shockwavesRef.current.splice(idx, 1);
          return;
        }

        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        ctx.lineWidth = wave.width;
        ctx.strokeStyle = getThemeColor(0.5) + `, ${wave.alpha})`;
        ctx.stroke();
      });

      // 4. DRAW FREQUENCY BARS (Mirrored)
      // Use fewer bars for a cleaner, wider look
      const barCount = 64; 
      const step = Math.floor(bufferLength / barCount);
      const barWidth = (width / barCount) * 0.8;
      
      for (let i = 0; i < barCount; i++) {
        const dataIndex = i * step;
        // Smooth falloff for high frequencies
        let value = dataArray[dataIndex];
        
        // Boost high freqs slightly for visual balance
        if (i > barCount / 2) value *= 1.5; 

        const percent = Math.min(1, value / 255);
        const barHeight = Math.max(4, percent * (height * 0.8)); // At least 4px
        
        // Dynamic X position
        const xPos = (width / 2) + (i * (barWidth + 2));
        const xNeg = (width / 2) - ((i + 1) * (barWidth + 2));

        const color = getThemeColor(i / barCount);
        
        // Add glow if loud
        if (percent > 0.8) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = color + ', 0.8)';
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = color + ', 1)';
        
        // Draw Right side
        // Center vertically
        const y = (height - barHeight) / 2;
        ctx.fillRect(xPos, y, barWidth, barHeight);
        
        // Draw Left side
        ctx.fillRect(xNeg, y, barWidth, barHeight);

        // Chance to spawn particle from bar tip on high energy
        if (isBeat && percent > 0.8 && Math.random() > 0.7) {
           spawnParticles(1, xPos + barWidth/2, y, 2, 0.5);
           spawnParticles(1, xNeg + barWidth/2, y, 2, 0.5);
        }
      }
      ctx.shadowBlur = 0; // Reset

      // 5. DRAW PARTICLES
      particlesRef.current.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.015;
        p.size *= 0.97;

        if (p.life <= 0) {
          particlesRef.current.splice(idx, 1);
          return;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color; // Color already includes alpha
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, colorMode]);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={400}
      className="w-full h-full object-cover rounded-xl opacity-90"
    />
  );
};

export default Visualizer;
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const Whiteboard = ({ strokes, onDrawStroke, onClear, disabled }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [color, setColor] = useState('#60a5fa');
  const [size, setSize] = useState(3);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const { width, height } = parent.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    renderStrokes();
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderStrokes = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((stroke) => drawStroke(context, stroke));
    if (currentStroke) {
      drawStroke(context, currentStroke);
    }
  };

  useEffect(() => {
    renderStrokes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentStroke]);

  const drawStroke = (context, stroke) => {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.size;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    stroke.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
  };

  const getCoordinates = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    if (disabled) return;
    event.target.setPointerCapture?.(event.pointerId);
    setIsDrawing(true);
    const point = getCoordinates(event);
    const stroke = {
      color,
      size,
      points: [point],
    };
    setCurrentStroke(stroke);
  };

  const handlePointerMove = (event) => {
    if (!isDrawing || !currentStroke) return;
    event.preventDefault();
    const point = getCoordinates(event);
    setCurrentStroke((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        points: [...prev.points, point],
      };
      return updated;
    });
  };

  const handlePointerUp = (event) => {
    if (event) {
      event.preventDefault();
      event.target.releasePointerCapture?.(event.pointerId);
    }
    if (!isDrawing || !currentStroke) return;
    onDrawStroke(currentStroke);
    setCurrentStroke(null);
    setIsDrawing(false);
  };

  const handleClear = () => {
    onClear();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Векторная доска</h3>
        <div className="flex items-center gap-3 text-xs text-slate-200">
          <label className="flex items-center gap-2">
            Цвет
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              disabled={disabled}
              className="w-10 h-6 rounded border border-white/10"
            />
          </label>
          <label className="flex items-center gap-2">
            Толщина
            <input
              type="range"
              min="1"
              max="12"
              value={size}
              disabled={disabled}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
          >
            Очистить
          </button>
        </div>
      </div>
      <div className={`relative rounded-3xl border ${disabled ? 'border-dashed border-white/20' : 'border-white/10'} bg-white/5 overflow-hidden`} style={{ minHeight: 320 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full h-full cursor-crosshair"
        />
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 backdrop-blur-sm">
            Доска доступна только во время активного звонка по запросу.
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;

Whiteboard.propTypes = {
  strokes: PropTypes.arrayOf(
    PropTypes.shape({
      color: PropTypes.string.isRequired,
      size: PropTypes.number.isRequired,
      points: PropTypes.arrayOf(
        PropTypes.shape({
          x: PropTypes.number.isRequired,
          y: PropTypes.number.isRequired,
        })
      ).isRequired,
    })
  ).isRequired,
  onDrawStroke: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

Whiteboard.defaultProps = {
  disabled: false,
};

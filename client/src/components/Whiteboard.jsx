import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const Whiteboard = ({ strokes, onDrawStroke, onClear, disabled }) => {
  const canvasRef = useRef(null);
  const boardWrapperRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [color, setColor] = useState('#60a5fa');
  const [size, setSize] = useState(3);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrapper = boardWrapperRef.current;
    if (!canvas || !wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
    renderStrokes();
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardWrapperRef.current);
      resizeCanvas();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
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
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
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

  const handleZoom = (delta) => {
    setScale((prev) => {
      const next = Math.min(3, Math.max(0.5, parseFloat((prev + delta).toFixed(2))));
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  const handleToggleFullscreen = async () => {
    if (!boardWrapperRef.current || disabled) return;
    try {
      if (document.fullscreenElement === boardWrapperRef.current) {
        await document.exitFullscreen();
      } else {
        await boardWrapperRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Не удалось переключить полноэкранный режим доски', error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Векторная доска</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200 justify-end">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleZoom(-0.25)}
              disabled={disabled || scale <= 0.5}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
              title="Уменьшить масштаб"
            >
              −
            </button>
            <span className="text-[11px] text-slate-300 w-14 text-center">
              {(scale * 100).toFixed(0)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(0.25)}
              disabled={disabled || scale >= 3}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
              title="Увеличить масштаб"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              disabled={disabled || scale === 1}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
            >
              100%
            </button>
          </div>
          <button
            type="button"
            onClick={handleToggleFullscreen}
            disabled={disabled}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
          >
            {isFullscreen ? 'Свернуть' : 'На весь экран'}
          </button>
        </div>
      </div>
      <div
        ref={boardWrapperRef}
        className={`relative rounded-3xl border ${disabled ? 'border-dashed border-white/20' : 'border-white/10'} bg-white/5`}
        style={{ minHeight: 320 }}
      >
        <div className="relative h-full w-full overflow-auto">
          <div
            style={{
              width: '100%',
              height: '100%',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full h-full cursor-crosshair"
            />
          </div>
        </div>
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

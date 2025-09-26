import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const TOOL_OPTIONS = [
  { id: 'select', label: 'Выделение' },
  { id: 'pan', label: 'Рука' },
  { id: 'pen', label: 'Перо' },
  { id: 'rectangle', label: 'Прямоугольник' },
  { id: 'ellipse', label: 'Эллипс' },
  { id: 'line', label: 'Линия' },
  { id: 'eraser', label: 'Ластик' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const generateId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `obj_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
};

const cloneObject = (object) => JSON.parse(JSON.stringify(object));

const getObjectBounds = (object) => {
  switch (object.type) {
    case 'path': {
      if (!object.points?.length) return null;
      const xs = object.points.map((point) => point.x);
      const ys = object.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case 'rectangle':
    case 'ellipse':
    case 'image':
    case 'file':
      return { x: object.x, y: object.y, width: object.width, height: object.height };
    case 'line': {
      const minX = Math.min(object.x1, object.x2);
      const minY = Math.min(object.y1, object.y2);
      const maxX = Math.max(object.x1, object.x2);
      const maxY = Math.max(object.y1, object.y2);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    default:
      return null;
  }
};

const distanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    const distX = point.x - start.x;
    const distY = point.y - start.y;
    return Math.sqrt(distX * distX + distY * distY);
  }
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const clampedT = clamp(t, 0, 1);
  const projX = start.x + clampedT * dx;
  const projY = start.y + clampedT * dy;
  const diffX = point.x - projX;
  const diffY = point.y - projY;
  return Math.sqrt(diffX * diffX + diffY * diffY);
};

const hitTestObject = (object, point, tolerance = 6) => {
  if (!object) return false;
  switch (object.type) {
    case 'path': {
      if (!object.points?.length) return false;
      for (let index = 0; index < object.points.length - 1; index += 1) {
        const start = object.points[index];
        const end = object.points[index + 1];
        if (distanceToSegment(point, start, end) <= tolerance) {
          return true;
        }
      }
      return false;
    }
    case 'rectangle':
    case 'ellipse':
    case 'image':
    case 'file': {
      const bounds = getObjectBounds(object);
      if (!bounds) return false;
      return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      );
    }
    case 'line':
      return (
        distanceToSegment(point, { x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 }) <=
        tolerance
      );
    default:
      return false;
  }
};

const drawPath = (context, object) => {
  if (!object.points?.length) return;
  context.beginPath();
  context.strokeStyle = object.color;
  context.lineWidth = object.size;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.moveTo(object.points[0].x, object.points[0].y);
  for (let index = 1; index < object.points.length; index += 1) {
    const point = object.points[index];
    context.lineTo(point.x, point.y);
  }
  context.stroke();
};

const drawRectangle = (context, object) => {
  context.beginPath();
  context.strokeStyle = object.color;
  context.lineWidth = object.size;
  context.rect(object.x, object.y, object.width, object.height);
  context.stroke();
};

const drawEllipse = (context, object) => {
  context.beginPath();
  context.strokeStyle = object.color;
  context.lineWidth = object.size;
  context.ellipse(
    object.x + object.width / 2,
    object.y + object.height / 2,
    Math.abs(object.width / 2),
    Math.abs(object.height / 2),
    0,
    0,
    2 * Math.PI
  );
  context.stroke();
};

const drawLine = (context, object) => {
  context.beginPath();
  context.strokeStyle = object.color;
  context.lineWidth = object.size;
  context.moveTo(object.x1, object.y1);
  context.lineTo(object.x2, object.y2);
  context.stroke();
};

const drawFile = (context, object) => {
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = '#94a3b8';
  context.fillStyle = 'rgba(148, 163, 184, 0.15)';
  context.beginPath();
  context.rect(object.x, object.y, object.width, object.height);
  context.fill();
  context.stroke();
  context.fillStyle = '#e2e8f0';
  context.font = '12px Inter, sans-serif';
  context.textBaseline = 'middle';
  const label = object.name || 'Файл';
  const textX = object.x + 12;
  const textY = object.y + object.height / 2;
  context.fillText(label, textX, textY);
  context.restore();
};

const Whiteboard = ({ objects, onAddObject, onUpdateObject, onRemoveObject, onClear, disabled }) => {
  const canvasRef = useRef(null);
  const boardWrapperRef = useRef(null);
  const boardContainerRef = useRef(null);
  const imageCacheRef = useRef(new Map());
  const selectionRef = useRef(null);
  const panRef = useRef(null);
  const viewRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });
  const renderCanvasRef = useRef(() => {});
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#60a5fa');
  const [size, setSize] = useState(3);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draftObject, setDraftObject] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isPanningActive, setIsPanningActive] = useState(false);

  useEffect(() => {
    viewRef.current = { scale, offset };
  }, [scale, offset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = boardWrapperRef.current;
    if (!canvas && !wrapper) return () => {};

    const suppressScroll = (event) => {
      if (disabled) return;
      event.preventDefault();
    };

    canvas?.addEventListener('wheel', suppressScroll, { passive: false });
    wrapper?.addEventListener('wheel', suppressScroll, { passive: false });
    return () => {
      canvas?.removeEventListener('wheel', suppressScroll);
      wrapper?.removeEventListener('wheel', suppressScroll);
    };
  }, [disabled]);

  useEffect(() => {
    if (selectedId && !objects.some((object) => object.id === selectedId)) {
      setSelectedId(null);
      selectionRef.current = null;
    }
  }, [objects, selectedId]);

  useEffect(() => {
    if (tool !== 'pan') {
      panRef.current = null;
      setIsPanningActive(false);
    }
  }, [tool]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = boardWrapperRef.current;
    if (!canvas || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
  }, []);

  const loadImage = useCallback((src) => {
    if (!src) return null;
    const cached = imageCacheRef.current.get(src);
    if (cached) {
      return cached;
    }
    const image = new Image();
    image.src = src;
    image.onload = () => {
      imageCacheRef.current.set(src, image);
      renderCanvasRef.current?.();
    };
    image.onerror = () => {
      imageCacheRef.current.delete(src);
    };
    imageCacheRef.current.set(src, image);
    return image;
  }, []);

  const drawImage = useCallback(
    (context, object) => {
      const image = loadImage(object.src);
      if (!image) return;
      context.drawImage(image, object.x, object.y, object.width, object.height);
    },
    [loadImage]
  );

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();

    context.save();
    context.translate(offset.x, offset.y);
    context.scale(scale, scale);

    objects.forEach((object) => {
      context.save();
      switch (object.type) {
        case 'path':
          drawPath(context, object);
          break;
        case 'rectangle':
          drawRectangle(context, object);
          break;
        case 'ellipse':
          drawEllipse(context, object);
          break;
        case 'line':
          drawLine(context, object);
          break;
        case 'image':
          drawImage(context, object);
          break;
        case 'file':
          drawFile(context, object);
          break;
        default:
          break;
      }
      context.restore();
    });

    if (draftObject) {
      context.save();
      context.globalAlpha = 0.8;
      switch (draftObject.type) {
        case 'path':
          drawPath(context, draftObject);
          break;
        case 'rectangle':
          drawRectangle(context, draftObject);
          break;
        case 'ellipse':
          drawEllipse(context, draftObject);
          break;
        case 'line':
          drawLine(context, draftObject);
          break;
        default:
          break;
      }
      context.restore();
    }

    if (selectedId) {
      const selected = objects.find((object) => object.id === selectedId);
      const bounds = selected ? getObjectBounds(selected) : null;
      if (bounds) {
        context.save();
        context.setLineDash([6, 4]);
        context.strokeStyle = 'rgba(96, 165, 250, 0.9)';
        context.lineWidth = 1.5;
        context.strokeRect(bounds.x - 6, bounds.y - 6, bounds.width + 12, bounds.height + 12);
        context.restore();
      }
    }

    context.restore();
  }, [drawImage, draftObject, objects, offset, scale, selectedId]);

  useEffect(() => {
    renderCanvasRef.current = renderCanvas;
  }, [renderCanvas]);

  useEffect(() => {
    resizeCanvas();
    renderCanvas();
  }, [renderCanvas, resizeCanvas]);

  useEffect(() => {
    renderCanvas();
  }, [objects, draftObject, renderCanvas, selectedId, scale, offset]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardContainerRef.current);
      resizeCanvas();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [resizeCanvas]);

  const getBoardPoint = useCallback(
    (event) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const { scale: currentScale, offset: currentOffset } = viewRef.current;
      const x = (event.clientX - rect.left - currentOffset.x) / currentScale;
      const y = (event.clientY - rect.top - currentOffset.y) / currentScale;
      return { x, y };
    },
    []
  );

  const findTopObject = useCallback(
    (point) => {
      for (let index = objects.length - 1; index >= 0; index -= 1) {
        const object = objects[index];
        if (hitTestObject(object, point)) {
          return object;
        }
      }
      return null;
    },
    [objects]
  );

  const moveObject = useCallback((object, delta) => {
    if (!object) return null;
    switch (object.type) {
      case 'path':
        return {
          points: object.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })),
        };
      case 'rectangle':
      case 'ellipse':
      case 'image':
      case 'file':
        return { x: object.x + delta.x, y: object.y + delta.y };
      case 'line':
        return {
          x1: object.x1 + delta.x,
          y1: object.y1 + delta.y,
          x2: object.x2 + delta.x,
          y2: object.y2 + delta.y,
        };
      default:
        return null;
    }
  }, []);

  const adjustZoom = useCallback((nextScale, anchor) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { scale: currentScale, offset: currentOffset } = viewRef.current;
    const clampedScale = clamp(Number(nextScale.toFixed(2)), 0.25, 3);
    const anchorPoint = anchor || { x: rect.width / 2, y: rect.height / 2 };
    const boardX = (anchorPoint.x - currentOffset.x) / currentScale;
    const boardY = (anchorPoint.y - currentOffset.y) / currentScale;
    const nextOffset = {
      x: anchorPoint.x - boardX * clampedScale,
      y: anchorPoint.y - boardY * clampedScale,
    };
    viewRef.current = { scale: clampedScale, offset: nextOffset };
    setScale(clampedScale);
    setOffset(nextOffset);
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      if (disabled || event.button === 2) return;
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture?.(event.pointerId);
      const point = getBoardPoint(event);

      if (tool === 'pan' || event.button === 1) {
        const { offset: currentOffset } = viewRef.current;
        panRef.current = {
          start: { x: event.clientX, y: event.clientY },
          initial: { ...currentOffset },
        };
        setIsPanningActive(true);
        return;
      }

      if (tool === 'eraser') {
        const target = findTopObject(point);
        if (target) {
          onRemoveObject(target.id);
        }
        return;
      }

      if (tool === 'select') {
        const target = findTopObject(point);
        if (target) {
          setSelectedId(target.id);
          selectionRef.current = {
            id: target.id,
            origin: cloneObject(target),
            start: point,
          };
        } else {
          setSelectedId(null);
          selectionRef.current = null;
        }
        return;
      }

      setSelectedId(null);

      const objectId = generateId();

      if (tool === 'pen') {
        setIsDrawing(true);
        setDraftObject({
          id: objectId,
          type: 'path',
          color,
          size,
          points: [point],
        });
        return;
      }

      if (tool === 'rectangle' || tool === 'ellipse') {
        setIsDrawing(true);
        setDraftObject({
          id: objectId,
          type: tool,
          color,
          size,
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          start: point,
        });
        return;
      }

      if (tool === 'line') {
        setIsDrawing(true);
        setDraftObject({
          id: objectId,
          type: 'line',
          color,
          size,
          x1: point.x,
          y1: point.y,
          x2: point.x,
          y2: point.y,
          start: point,
        });
      }
    },
    [color, disabled, findTopObject, getBoardPoint, onRemoveObject, size, tool]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      const point = getBoardPoint(event);

      if (panRef.current) {
        const { start, initial } = panRef.current;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        setOffset(() => {
          const nextOffset = { x: initial.x + dx, y: initial.y + dy };
          viewRef.current = { scale: viewRef.current.scale, offset: nextOffset };
          return nextOffset;
        });
        return;
      }

      if (!isDrawing && selectionRef.current) {
        const { id, origin, start } = selectionRef.current;
        const delta = { x: point.x - start.x, y: point.y - start.y };
        const updates = moveObject(origin, delta);
        if (updates) {
          onUpdateObject(id, updates);
        }
        return;
      }

      if (!isDrawing || !draftObject) return;

      if (draftObject.type === 'path') {
        setDraftObject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            points: [...prev.points, point],
          };
        });
        return;
      }

      if (draftObject.type === 'rectangle' || draftObject.type === 'ellipse') {
        const start = draftObject.start;
        const width = point.x - start.x;
        const height = point.y - start.y;
        setDraftObject((prev) =>
          prev
            ? {
                ...prev,
                x: Math.min(start.x, point.x),
                y: Math.min(start.y, point.y),
                width: Math.abs(width),
                height: Math.abs(height),
              }
            : prev
        );
        return;
      }

      if (draftObject.type === 'line') {
        setDraftObject((prev) =>
          prev
            ? {
                ...prev,
                x2: point.x,
                y2: point.y,
              }
            : prev
        );
      }
    },
    [disabled, draftObject, getBoardPoint, isDrawing, moveObject, onUpdateObject]
  );

  const finalizeDraft = useCallback(() => {
    if (!draftObject) return;
    if (draftObject.type === 'path' && draftObject.points.length < 2) {
      setDraftObject(null);
      return;
    }
    if (
      (draftObject.type === 'rectangle' || draftObject.type === 'ellipse') &&
      (draftObject.width < 4 || draftObject.height < 4)
    ) {
      setDraftObject(null);
      return;
    }
    if (
      draftObject.type === 'line' &&
      Math.hypot(draftObject.x2 - draftObject.x1, draftObject.y2 - draftObject.y1) < 4
    ) {
      setDraftObject(null);
      return;
    }
    if (draftObject.type === 'path') {
      onAddObject({ ...draftObject });
    } else {
      const rest = { ...draftObject };
      delete rest.start;
      onAddObject(rest);
    }
    setDraftObject(null);
  }, [draftObject, onAddObject]);

  const handlePointerUp = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.releasePointerCapture?.(event.pointerId);
      }
      if (panRef.current) {
        panRef.current = null;
        setIsPanningActive(false);
        return;
      }
      if (selectionRef.current) {
        selectionRef.current = null;
      }
      if (isDrawing) {
        finalizeDraft();
        setIsDrawing(false);
      }
    },
    [disabled, finalizeDraft, isDrawing]
  );

  const handleWheel = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const nextScale = clamp(scale + delta, 0.25, 3);
      adjustZoom(nextScale, anchor);
    },
    [adjustZoom, disabled, scale]
  );

  const handleDoubleClick = useCallback(
    (event) => {
      if (disabled) return;
      const point = getBoardPoint(event);
      const target = findTopObject(point);
      if (!target) return;
      if (target.type === 'image' && target.src) {
        window.open(target.src, '_blank', 'noopener');
        return;
      }
      if (target.type === 'file' && target.data) {
        try {
          const byteString = atob(target.data.split(',')[1] || target.data);
          const arrayBuffer = new Uint8Array(byteString.length);
          for (let index = 0; index < byteString.length; index += 1) {
            arrayBuffer[index] = byteString.charCodeAt(index);
          }
          const blob = new Blob([arrayBuffer], { type: target.mimeType || 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = target.name || 'attachment';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('File open error', err);
        }
      }
    },
    [disabled, findTopObject, getBoardPoint]
  );

  const handleClear = () => {
    if (disabled) return;
    onClear();
    setDraftObject(null);
    setSelectedId(null);
  };

  const handleResetView = () => {
    const resetOffset = { x: 0, y: 0 };
    viewRef.current = { scale: 1, offset: resetOffset };
    setScale(1);
    setOffset(resetOffset);
  };

  const handleToggleFullscreen = async () => {
    if (!boardContainerRef.current || disabled) return;
    try {
      if (document.fullscreenElement === boardContainerRef.current) {
        await document.exitFullscreen();
      } else {
        await boardContainerRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Не удалось переключить полноэкранный режим доски', error);
    }
  };

  const handleImageUpload = (event) => {
    if (disabled) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      const image = new Image();
      image.onload = () => {
        const maxWidth = 420;
        const maxHeight = 360;
        let { width, height } = image;
        const ratio = Math.min(1, maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
        const { scale: currentScale, offset: currentOffset } = viewRef.current;
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        const center = rect
          ? {
              x: (rect.width / 2 - currentOffset.x) / currentScale,
              y: (rect.height / 2 - currentOffset.y) / currentScale,
            }
          : { x: 0, y: 0 };
        onAddObject({
          id: generateId(),
          type: 'image',
          x: center.x - width / 2,
          y: center.y - height / 2,
          width,
          height,
          src,
          name: file.name,
          mimeType: file.type,
        });
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (event) => {
    if (disabled) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const { scale: currentScale, offset: currentOffset } = viewRef.current;
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const center = rect
        ? {
            x: (rect.width / 2 - currentOffset.x) / currentScale,
            y: (rect.height / 2 - currentOffset.y) / currentScale,
          }
        : { x: 0, y: 0 };
      const width = 240;
      const height = 96;
      onAddObject({
        id: generateId(),
        type: 'file',
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        name: file.name,
        data: typeof dataUrl === 'string' ? dataUrl : null,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const canvasCursor = useMemo(() => {
    switch (tool) {
      case 'select':
        return 'cursor-pointer';
      case 'pan':
        return isPanningActive ? 'cursor-grabbing' : 'cursor-grab';
      case 'eraser':
        return 'cursor-cell';
      case 'pen':
      case 'rectangle':
      case 'ellipse':
      case 'line':
        return 'cursor-crosshair';
      default:
        return 'cursor-default';
    }
  }, [isPanningActive, tool]);

  const containerClasses = `space-y-3 flex flex-col ${isFullscreen ? 'h-full bg-slate-900/95 p-4' : ''}`;
  const boardWrapperClasses = `relative rounded-3xl border ${
    disabled ? 'border-dashed border-white/20' : 'border-white/10'
  } bg-white/5 overflow-hidden ${isFullscreen ? 'flex-1' : ''}`;

  return (
    <div ref={boardContainerRef} className={containerClasses}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Векторная доска</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200 justify-end">
          <div className="flex flex-wrap gap-2">
            {TOOL_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTool(option.id)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-full border transition ${
                  tool === option.id
                    ? 'border-indigo-400 bg-indigo-500/20 text-white'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled}
              className="px-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 transition"
            >
              Добавить изображение
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="px-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 transition"
            >
              Добавить файл
            </button>
          </div>
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
              max="16"
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
              onClick={() => adjustZoom(scale - 0.25, null)}
              disabled={disabled || scale <= 0.25}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
              title="Уменьшить масштаб"
            >
              −
            </button>
            <span className="text-[11px] text-slate-300 w-14 text-center">{(scale * 100).toFixed(0)}%</span>
            <button
              type="button"
              onClick={() => adjustZoom(scale + 0.25, null)}
              disabled={disabled || scale >= 3}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
              title="Увеличить масштаб"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetView}
              disabled={disabled || (scale === 1 && offset.x === 0 && offset.y === 0)}
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
        className={boardWrapperClasses}
        style={{ minHeight: 360 }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          className={`w-full h-full ${canvasCursor}`}
          style={{ touchAction: 'none' }}
        />
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 backdrop-blur-sm">
            Доска доступна только во время активного звонка по запросу.
          </div>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>
    </div>
  );
};

Whiteboard.propTypes = {
  objects: PropTypes.arrayOf(PropTypes.object).isRequired,
  onAddObject: PropTypes.func.isRequired,
  onUpdateObject: PropTypes.func.isRequired,
  onRemoveObject: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

Whiteboard.defaultProps = {
  disabled: false,
};

export default Whiteboard;

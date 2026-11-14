import { RefObject, useRef, useCallback } from 'react';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface UsePanZoomOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
  getCamera: () => Camera;
  setCamera: (c: Partial<Camera>) => void;
  contentSize: { width: number; height: number } | null; // in pixels
}

export function usePanZoom({ canvasRef, getCamera, setCamera, contentSize }: UsePanZoomOptions) {
  const lastMousePos = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);

  const getConstrainedPos = useCallback(
    (x: number, y: number, currentZoom: number) => {
      // Fallback: no constraints if no content size
      if (!contentSize) return { x, y };
      const canvas = canvasRef.current;
      if (!canvas) return { x, y };

      const mapW = contentSize.width;
      const mapH = contentSize.height;
      const viewW = canvas.width / currentZoom;
      const viewH = canvas.height / currentZoom;

      const limitX = Math.max(mapW, viewW * 0.4);
      const limitY = Math.max(mapH, viewH * 0.4);

      return {
        x: Math.min(Math.max(x, -limitX / 2), limitX * 1.5),
        y: Math.min(Math.max(y, -limitY / 2), limitY * 1.5),
      };
    },
    [canvasRef, contentSize],
  );

  const applyZoom = useCallback(
    (newZoom: number, focusX: number, focusY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const cam = getCamera();
      const finalZoom = Math.min(Math.max(newZoom, 0.1), 10);
      const worldX = (focusX - canvas.width / 2) / cam.zoom + cam.x;
      const worldY = (focusY - canvas.height / 2) / cam.zoom + cam.y;

      const newCamX = worldX - (focusX - canvas.width / 2) / finalZoom;
      const newCamY = worldY - (focusY - canvas.height / 2) / finalZoom;

      const constrained = getConstrainedPos(newCamX, newCamY, finalZoom);
      setCamera({ zoom: finalZoom, x: constrained.x, y: constrained.y });
    },
    [canvasRef, getCamera, setCamera, getConstrainedPos],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const cam = getCamera();
      const factor = Math.exp(-e.deltaY * 0.002);
      applyZoom(cam.zoom * factor, mouseX, mouseY);
    },
    [canvasRef, getCamera, applyZoom],
  );

  const startPan = useCallback((clientX: number, clientY: number) => {
    isPanning.current = true;
    lastMousePos.current = { x: clientX, y: clientY };
  }, []);

  const panMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPanning.current) return false;
      const dx = clientX - lastMousePos.current.x;
      const dy = clientY - lastMousePos.current.y;
      const cam = getCamera();
      const rawNextX = cam.x - dx / cam.zoom;
      const rawNextY = cam.y - dy / cam.zoom;
      const constrained = getConstrainedPos(rawNextX, rawNextY, cam.zoom);
      setCamera({ x: constrained.x, y: constrained.y });
      lastMousePos.current = { x: clientX, y: clientY };
      return true;
    },
    [getCamera, setCamera, getConstrainedPos],
  );

  const stopPan = useCallback(() => {
    isPanning.current = false;
  }, []);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;
      const cam = getCamera();
      return {
        x: (mouseX - canvas.width / 2) / cam.zoom + cam.x,
        y: (mouseY - canvas.height / 2) / cam.zoom + cam.y,
      };
    },
    [canvasRef, getCamera],
  );

  return {
    applyZoom,
    handleWheel,
    startPan,
    panMove,
    stopPan,
    screenToWorld,
  };
}

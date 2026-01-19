import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';

type ActiveSettings = {
	fps: boolean;
	aa: boolean;
	zBuffer: boolean;
	culling: boolean;
	normals: boolean;
	normalsColor: string;
	bbox: boolean;
	bboxlocal: boolean;
	wireframe: boolean;
	vertex: boolean;
	vertexColor: string;
	vertexSize: number;
	wireframeColor?: string;
	normalsLengthPercent?: number;
}

const App: React.FC = () => {
	// background default to black
	const [bgColor, setBgColor] = useState<string>('rgba(0,0,0,1)');
	const [bboxLocalColor, setBboxLocalColor] = useState<string>('rgba(255,255,0,1)');
	const [bboxGlobalColor, setBboxGlobalColor] = useState<string>('rgba(255,0,0,1)');
	const [meshes, setMeshes] = useState<any[]>([]);
	const [selectedMeshId, setSelectedMeshId] = useState<number | null>(null);

	const [activeSettings, setActiveSettings] = useState<ActiveSettings>({
		fps: true,
		aa: false,
		zBuffer: true,
		culling: true,
		normals: false,
		normalsColor: 'rgba(0, 0, 255, 1)',
		bbox: false,
		bboxlocal: false,
		wireframe: false,
		vertex: false,
		vertexColor: 'rgb(23, 178, 209)',
		vertexSize: 3,
		wireframeColor: 'rgba(255,255,255,1)'
	});

	const toggleBBoxLocal = useCallback(() => {
	setActiveSettings(prev => ({ 
		...prev, 
		bboxlocal: !prev.bboxlocal,
	}));
	}, []);

	// Exponer globalmente
	useEffect(() => {
	(window as any).toggleBBoxLocal = toggleBBoxLocal;
	}, [toggleBBoxLocal]);

	return (
		<div className="app">
			<div className="content-layout">
				<Sidebar
					bgColor={bgColor}
					setBgColor={setBgColor}
					meshes={meshes}
					setMeshes={setMeshes}
					activeSettings={activeSettings}
					setActiveSettings={setActiveSettings}
					selectedMeshId={selectedMeshId}
					setSelectedMeshId={setSelectedMeshId}
					bboxLocalColor={bboxLocalColor}
  					setBboxLocalColor={setBboxLocalColor}
					bboxGlobalColor={bboxGlobalColor}
					setBboxGlobalColor={setBboxGlobalColor}
				/>
				<Canvas
					bgColor={bgColor}
					meshes={meshes}
					depthEnabled={activeSettings.zBuffer}
					cullingEnabled={activeSettings.culling}
					setSelectedMeshId={setSelectedMeshId}
					setMeshes={setMeshes}
					selectedMeshId={selectedMeshId}
					bboxColor={activeSettings.bboxlocal && selectedMeshId !== null ? bboxLocalColor : undefined}
					bboxGlobalColor={bboxGlobalColor}
					showLocalBBox={activeSettings.bboxlocal}
					toggleBBoxLocal={() => setActiveSettings(prev => ({ ...prev, bboxlocal: !prev.bboxlocal }))}
					activeSettings={activeSettings}
					setActiveSettings={setActiveSettings}
				/>
			</div>
		</div>
	);
};

export default App;
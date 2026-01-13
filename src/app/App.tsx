import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';

type ActiveSettings = {
	fps: boolean;
	aa: boolean;
	zBuffer: boolean;
	culling: boolean;
	normals: boolean;
	bbox: boolean;
	bboxlocal: boolean;
	wireframe: boolean;
}

const App: React.FC = () => {
	// background default to black
	const [bgColor, setBgColor] = useState<string>('rgba(0,0,0,1)');
	const [bboxLocalColor, setBboxLocalColor] = useState<string>('rgba(255,255,0,1)');
	const [meshes, setMeshes] = useState<any[]>([]);
	const [selectedMeshId, setSelectedMeshId] = useState<number | null>(null);

	const [activeSettings, setActiveSettings] = useState<ActiveSettings>({
		fps: true,
		aa: false,
		zBuffer: true,
		culling: true,
		normals: false,
		bbox: false,
		bboxlocal: false,
		wireframe: false,
	});

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
				/>
				<Canvas
					bgColor={bgColor}
					meshes={meshes}
					depthEnabled={activeSettings.zBuffer}
					cullingEnabled={activeSettings.culling}
					setSelectedMeshId={setSelectedMeshId}
					setMeshes={setMeshes}
					selectedMeshId={selectedMeshId}
					bboxColor={bboxLocalColor}
					showLocalBBox={activeSettings.bboxlocal}
				/>
			</div>
		</div>
	);
};

export default App;
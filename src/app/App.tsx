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
	wireframe: boolean;
}

const App: React.FC = () => {
	// background default to black
	const [bgColor, setBgColor] = useState<string>('rgba(0,0,0,1)');
	const [meshes, setMeshes] = useState<any[]>([]);

	const [activeSettings, setActiveSettings] = useState<ActiveSettings>({
		fps: true,
		aa: false,
		zBuffer: true,
		culling: true,
		normals: false,
		bbox: false,
		wireframe: false,
	});

	return (
		<div className="app">
			<div className="content-layout">
				<Sidebar
					bgColor={bgColor}
					setBgColor={setBgColor}
					setMeshes={setMeshes}
					activeSettings={activeSettings}
					setActiveSettings={setActiveSettings}
				/>
				<Canvas bgColor={bgColor} meshes={meshes} depthEnabled={activeSettings.zBuffer} cullingEnabled={activeSettings.culling} />
			</div>
		</div>
	);
};

export default App;
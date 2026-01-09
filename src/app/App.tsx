import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';

const App: React.FC = () => {
	// background default to black
	const [bgColor, setBgColor] = useState<string>('rgba(0,0,0,1)');
	const [meshes, setMeshes] = useState<any[]>([]);

	return (
		<div className="app">
			<div className="content-layout">
				<Sidebar bgColor={bgColor} setBgColor={setBgColor} setMeshes={setMeshes} />
				<Canvas bgColor={bgColor} meshes={meshes} />
			</div>
		</div>
	);
};

export default App;
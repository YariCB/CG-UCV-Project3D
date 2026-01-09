import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';

const App: React.FC = () => {
	// background default to black
	const [bgColor, setBgColor] = useState<string>('rgba(0,0,0,1)');

	return (
		<div className="app">
			<div className="content-layout">
				<Sidebar bgColor={bgColor} setBgColor={setBgColor} />
				<Canvas bgColor={bgColor} />
			</div>
		</div>
	);
};

export default App;
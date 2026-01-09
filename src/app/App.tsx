import React from 'react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';

const App: React.FC = () => (
	<div className="app">
		<div className="content-layout">
			<Sidebar />
			<Canvas />
		</div>
	</div>
);

export default App;
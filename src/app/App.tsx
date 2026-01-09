import React, { useEffect } from 'react';

const App: React.FC = () => {
	return (
		<div className="app">
			<p>Introducción a la Computación Gráfica. Proyecto #2</p>

			<canvas id="canvas" width={800} height={600}></canvas>
		</div>
	);
};

export default App;
import React, { useEffect } from 'react';

const App: React.FC = () => {
	useEffect(() => {
		// Dynamically import the canvas game script after the component mounts
		import('./index');
	}, []);

	return (
		<div className="app">
			<h1>Breakout!</h1>

			<button id="rules-btn" className="btn rules-btn">Show Rules</button>

			<div id="rules" className="rules">
				<h2>How To Play:</h2>
				<p>Use your right and left keys to move the paddle to bounce the ball up and break the blocks.</p>
				<p>If you miss the ball, your score and the blocks will reset.</p>
				<button id="close-btn" className="btn">Close</button>
			</div>

			<canvas id="canvas" width={800} height={600}></canvas>
		</div>
	);
};

export default App;

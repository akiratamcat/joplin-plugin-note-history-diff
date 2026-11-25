import joplin from 'api';
import { registerDevTools } from './dev/devTools';
import { registerDiffPanel } from './panelController';

joplin.plugins.register({
	onStart: async function() {
		await registerDiffPanel();
		// Verification prototype commands (Tools menu, "[dev] …"). To be removed before v1.
		await registerDevTools();
	},
});

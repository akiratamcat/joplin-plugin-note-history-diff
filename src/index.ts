import joplin from 'api';
import { registerDevTools } from './dev/devTools';
import { registerHistoryEditorView } from './editorViewController';

joplin.plugins.register({
	onStart: async function() {
		await registerHistoryEditorView();
		// Verification prototype commands (Tools menu, "[dev] …"). To be removed before v1.
		await registerDevTools();
	},
});

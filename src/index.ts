import joplin from 'api';
import { registerHistoryEditorView } from './editorViewController';

joplin.plugins.register({
	onStart: async function() {
		await registerHistoryEditorView();
	},
});

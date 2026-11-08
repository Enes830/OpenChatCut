import { EditorWorkspaceView } from './editor/EditorWorkspaceView';
import { SimpleEditorWorkspaceView } from './editor/SimpleEditorWorkspaceView';
import { useEditorController, type EditorProps } from './editor/useEditorController';

export default function Editor(props: EditorProps) {
  const workspace = useEditorController(props);
  if (props.mode === 'simple') {
    return <SimpleEditorWorkspaceView {...workspace} />;
  }
  return <EditorWorkspaceView {...workspace} />;
}

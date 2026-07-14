import { useFloorplan } from '../../state/FloorplanContext';
import { Modal, ModalFooter, ModalHeader } from '../primitives/Modal';
import { Button } from '../primitives/Button';

const MODE_LABEL: Record<string, string> = { assign: 'Assignment', book: 'Booking' };

export function UnsavedChangesModal() {
  const { state, actions } = useFloorplan();
  if (!state.pendingModeSwitch) return null;

  const targetLabel = MODE_LABEL[state.pendingModeSwitch] ?? state.pendingModeSwitch;

  return (
    <Modal onClose={actions.cancelModeSwitch} width={420}>
      <ModalHeader
        title="Unsaved changes"
        subtitle={`You have ${state.unsavedChanges} unsaved change${state.unsavedChanges === 1 ? '' : 's'} on this floorplan.`}
        onClose={actions.cancelModeSwitch}
      />
      <div style={{ padding: '0 20px 4px', fontSize: 13, color: 'var(--ink-600)' }}>
        Save or discard them before switching to {targetLabel}.
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={actions.cancelModeSwitch}>
          Cancel
        </Button>
        <Button variant="danger" onClick={actions.confirmDiscardAndSwitch}>
          Discard
        </Button>
        <Button variant="primary" onClick={actions.confirmSaveAndSwitch}>
          Save changes
        </Button>
      </ModalFooter>
    </Modal>
  );
}

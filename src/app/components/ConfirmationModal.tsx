import React from 'react';
import '../../styles/ConfirmationModal.css';

interface ConfirmationModalProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
    title, 
    message, 
    onConfirm, 
    onCancel 
}) => {
    return (
        // Overlay semitransparente que cubre toda la pantalla
        <div className="modal-overlay" onClick={onCancel}>
            {/* Contenedor principal del modal (detiene la propagación del clic) */}
            <div 
                className="confirmation-modal-container" 
                onClick={e => e.stopPropagation()}
            >
                {/* Estilo del título similar a Sidebar/Tooltip */}
                <div className="modal-header">
                    <div className="modal-title">{title}</div>
                </div>

                {/* Contenido del mensaje */}
                <div className="modal-body">
                    <p>{message}</p>
                </div>

                {/* Botones de acción */}
                <div className="modal-actions">
                    <button 
                        className="modal-button cancel" 
                        onClick={onCancel}
                    >
                        Cancelar
                    </button>
                    <button 
                        className="modal-button confirm" 
                        onClick={onConfirm}
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
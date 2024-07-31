import React, { useState, useEffect, useRef } from 'react';
import './Notifications.css';
import Modal from '../Modal/Modal';

const Notifications: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, title: "Sample Video Title 1", datetime: "2024-07-30 14:30", length: "10:30", progress: "50%", content: "Here is the detailed content of the video transcription progress..." },
    { id: 2, title: "Sample Video Title 2", datetime: "2024-07-30 15:00", length: "12:00", progress: "75%", content: "Here is the detailed content of the video transcription progress..." }
  ]);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => {
    setOpen(!open);
  };

  const openModal = (notification: any) => {
    setSelectedNotification(notification);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const removeNotification = (id: number) => {
    setNotifications(notifications.filter(notification => notification.id !== id));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="notifications" ref={menuRef}>
      <button className="notifications-icon" onClick={toggleMenu}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v2a4 4 0 0 1-8 0v-2"></path><rect x="2" y="7" width="20" height="13" rx="2" ry="2"></rect><path d="M7 7V4a4 4 0 0 1 8 0v3"></path></svg>
      </button>
      {open && (
        <div className="notifications-menu">
          {notifications.map(notification => (
            <div className="notification-item" key={notification.id}>
              <button className="close-button" onClick={() => removeNotification(notification.id)}>×</button>
              <h4>{notification.title}</h4>
              <p><strong>Datetime:</strong> {notification.datetime}</p>
              <p><strong>Length:</strong> {notification.length}</p>
              <p><strong>Progress:</strong> {notification.progress}</p>
              <button className="view-button" onClick={() => openModal(notification)}>View Details</button>
            </div>
          ))}
        </div>
      )}
      {selectedNotification && (
        <Modal
          isOpen={modalOpen}
          onClose={closeModal}
          title={selectedNotification.title}
          datetime={selectedNotification.datetime}
          length={selectedNotification.length}
          progress={selectedNotification.progress}
          content={selectedNotification.content}
        />
      )}
    </div>
  );
};

export default Notifications;

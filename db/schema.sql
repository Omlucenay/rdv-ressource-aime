CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prestation_id VARCHAR(50) NOT NULL,
  prestation_titre VARCHAR(100) NOT NULL,
  mode ENUM('cabinet', 'visio', 'telephone') NOT NULL,
  date DATE NOT NULL,
  heure TIME NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telephone VARCHAR(20),
  statut ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
  stripe_session_id VARCHAR(200),
  replace_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
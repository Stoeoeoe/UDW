import { createRoot } from 'react-dom/client';
import { Workspace } from './Workspace';
import '../styles.css';
import './playground.css';

createRoot(document.getElementById('root')!).render(<Workspace />);

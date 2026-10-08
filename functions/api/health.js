import { health } from '../../cf/lib.js';
export const onRequestGet = async () => health();

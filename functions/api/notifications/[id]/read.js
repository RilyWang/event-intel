import { markRead } from '../../../../cf/lib.js';
export const onRequestPost = async ({ params }) => markRead(params.id);

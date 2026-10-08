import { events } from '../../../cf/lib.js';
export const onRequestGet = async ({ request }) => events(new URL(request.url));

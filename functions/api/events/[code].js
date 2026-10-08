import { eventDetail } from '../../../cf/lib.js';
export const onRequestGet = async ({ params }) => eventDetail(params.code);

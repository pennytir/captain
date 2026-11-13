import { redirect } from '@sveltejs/kit';
import blueprint from '../../../demo_wp_blueprint.json?raw';

const base64Blueprint = btoa(blueprint);
const playgroundUrl = `https://playground.wordpress.net/?mode=seamless#${base64Blueprint}`;

export function load() {
	redirect(302, playgroundUrl);
}

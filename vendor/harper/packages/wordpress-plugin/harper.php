<?php
/**
 * Plugin Name:       Harper
 * Plugin URI:        https://writewithharper.com
 * Description:       Harper is the grammar checker that respects your privacy
 * Version:           0.0.1
 * Requires at least: 6.7
 * Requires PHP:      7.4
 * Author:            Elijah Potter
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       harper
 *
 * @package Harper
 */

declare( strict_types = 1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Registers the block using the metadata loaded from the `block.json` file.
 * Behind the scenes, it registers also all assets so they can be enqueued
 * through the block editor in the corresponding context.
 *
 * @see https://developer.wordpress.org/reference/functions/register_block_type/
 */
function create_harper_block_init() {
	register_block_type( __DIR__ . '/build/harper' );
}
add_action( 'init', 'create_harper_block_init' );

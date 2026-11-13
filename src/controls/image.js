/**
 * ImageField — ported verbatim from the original GCB ImageControlComponent.
 *
 * Stored shape:
 *   {
 *     id, url, alt, title, filename, width, height, filesize,
 *     focalPoint: { x, y },
 *     size: 'cover' | 'contain' | 'auto',
 *     repeat: boolean,
 *     isFixed: boolean,
 *     customWidth: string  // e.g. "320px", "50%"
 *     ratio: '' | '4/5' | '1/1' | '4/3' | '16/9'  // enableShape: '' = its own shape
 *     zoom: number         // 1 = as drawn; up to 3, about the focal point (from 0.5 at its own shape, enableShape)
 *     scale: number        // a contained logo's size, in % (80–125; 100 = as the set)
 *   }
 *
 * Features (toggleable via control config):
 *   - enableFocalPoint        (default true)  → FocalPointPicker on the selected image
 *   - enableSizeOptions       (default true)  → cover / contain / tile + custom width
 *   - enableTile              (default true)  → the Tile option and the custom width. Off for a picture
 *                                               drawn as an <img>, which cannot be tiled or given a
 *                                               background width
 *   - enableShape             (default false) → a Shape of its own (`ratio`: '' its own | '4/5' | '1/1'
 *                                               | '4/3' | '16/9'), for a picture that stands in the page
 *                                               as an <img>. The shape IS the fit, so Size is not
 *                                               offered: its own shape shows the whole picture, any
 *                                               other is covered, cropped round the focal point. At
 *                                               its own shape it can also be zoomed out, down to half.
 *   - enableRepeatOptions     (default true)  → repeat toggle (when size != cover)
 *   - enableFixedBackground   (default true)  → background-attachment: fixed
 *   - enableZoom              (default true)  → zoom 1–3× about the focal point (cover)
 *   - contained               ('logos' | 'alike', default none) → a picture that must show
 *                                               its whole object (gcb-pro's data-gcb-contain):
 *                                               nothing that crops or moves it is offered; a
 *                                               logo gets a Scale (80–125%) for a file that
 *                                               reads light or carries its own padding
 *   - settingsInline          (default false) → the settings sit in the field itself,
 *                                               not in a popover of their own; the
 *                                               host already shows them in a panel
 *                                               (gcb-lite's block-toolbar image field)
 *                                               and carries the label there
 *
 * THE BLOCK CHOOSES THE SET. A background image keeps the defaults (focal point, zoom, cover /
 * contain / tile, width, repeat, fixed). A picture drawn as an <img> asks for
 *   enableShape: true, enableTile: false, enableRepeatOptions: false, enableFixedBackground: false
 * and gets focal point, zoom and Shape — nothing that only a background can do.
 */

import { __ } from '@wordpress/i18n';
import {
	Button,
	FocalPointPicker,
	RangeControl,
	SelectControl,
	Icon,
	ToggleControl,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalUnitControl as UnitControl,
	__experimentalHStack as HStack,
	__experimentalTruncate as Truncate,
	FlexItem,
	VisuallyHidden,
} from '@wordpress/components';
import { pencil as editIcon } from '@wordpress/icons';
import MediaPicker from './MediaPicker';
import PopoverOrModal from './PopoverOrModal';
import MediaCapabilityGate from './MediaCapabilityGate';
import MediaTriggerBadges from './MediaTriggerBadges';

const TOGGLE_BUTTON_STYLE = {
	width: '100%',
	height: 'auto',
	padding: '12px',
	justifyContent: 'flex-start',
	border: '1px solid #ddd',
	borderRadius: '2px',
	backgroundColor: '#fff',
};

/**
 * Resolve which MIME family the media library modal should allow. The
 * control defaults to images only; opt in to broader picks via the
 * schema:
 *
 *   { "type": "image", "allowVideo": true }            // image OR video
 *   { "type": "image", "allowedTypes": ["video"] }     // explicit override
 *
 * Authors uploading a video get a working URL back through the same
 * value shape — render templates pick <img> vs <video> by extension
 * (see the saas-banner / saas-feature-scroll item render.php examples).
 */
/** the shapes a picture can be cropped to (enableShape); '' is its own */
const FLOW_SHAPES = [
	{ value: '', label: () => __('Its own', 'gcblite') },
	{ value: '4/5', label: () => __('Tall (4:5)', 'gcblite') },
	{ value: '1/1', label: () => __('Square', 'gcblite') },
	{ value: '4/3', label: () => __('Landscape (4:3)', 'gcblite') },
	{ value: '16/9', label: () => __('Wide (16:9)', 'gcblite') },
];

function resolveAllowedTypes(control) {
	if (Array.isArray(control?.allowedTypes) && control.allowedTypes.length > 0) {
		return control.allowedTypes;
	}
	if (control?.allowVideo) {
		return ['image', 'video'];
	}
	return ['image'];
}

/**
 * The settings panel rendered inside the Dropdown popover. Shows focal point,
 * size, custom width, repeat, fixed-background. Also offers a Replace button.
 *
 * Exported so the gallery control can reuse it for each gallery row.
 */
export function ImageControlContent({ control, value, onChange, onReplace }) {
	/* a contained picture is never cropped, moved or tiled: those settings are not offered */
	const contained = control.contained === 'logos' || control.contained === 'alike' ? control.contained : '';
	const enableFocalPoint = !contained && control.enableFocalPoint !== false;
	const enableSizeOptions = !contained && control.enableSizeOptions !== false;
	const enableRepeatOptions = !contained && control.enableRepeatOptions !== false;
	const enableFixedBackground = !contained && control.enableFixedBackground !== false;
	const enableZoom = !contained && control.enableZoom !== false;
	const enableTile = control.enableTile !== false;
	const enableShape = !contained && control.enableShape === true;

	const imageValue = value || {};
	const focalPoint = imageValue.focalPoint || { x: 0.5, y: 0.5 };
	const ratio = enableShape && FLOW_SHAPES.some((o) => o.value === imageValue.ratio) ? imageValue.ratio : '';
	/* a picture with a Shape setting always covers that shape; its own shape is the whole picture */
	const size = enableShape ? 'cover' : imageValue.size || 'cover';
	const customWidth = imageValue.customWidth || '';
	const repeat = imageValue.repeat !== false;
	const isFixed = imageValue.isFixed || false;
	/* a picture that covers is only ever zoomed in; one at its own shape may be zoomed out too */
	const zoomMin = enableShape && ratio === '' ? 0.5 : 1;
	const zoom = Number(imageValue.zoom) > zoomMin ? Number(imageValue.zoom) : zoomMin === 1 ? 1 : Number(imageValue.zoom) > 0 ? Math.max(zoomMin, Number(imageValue.zoom)) : 1;
	const scale = Number(imageValue.scale) > 0 ? Math.max(80, Math.min(125, Number(imageValue.scale))) : 100;

	const updateValue = (updates) => onChange({ ...imageValue, ...updates });

	if (!imageValue.url) return null;

	const displayTitle = imageValue.title
		|| imageValue.filename
		|| imageValue.alt
		|| __('(no description)', 'gcblite');

	return (
		<div className="gcb-image-control-content__sections">
			{onReplace && (
				<Button
					onClick={onReplace}
					className="gcb-modal-toggle-button"
					aria-label={__('Replace image', 'gcblite')}
					style={{
						width: '100%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-start',
						padding: '8px 12px',
						border: '1px solid #ddd',
						borderRadius: 2,
						background: 'white',
						cursor: 'pointer',
						gap: 12,
					}}
				>
					<span
						aria-hidden
						style={{
							width: 32,
							height: 32,
							borderRadius: '100%',
							backgroundImage: `url(${imageValue.url})`,
							backgroundSize: 'cover',
							backgroundPosition: 'center',
							flexShrink: 0,
							border: '1px solid #ddd',
							display: 'block',
						}}
					/>
					<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
						{displayTitle}
					</span>
					<Icon icon={editIcon} size={20} style={{ fill: '#1e1e1e', flexShrink: 0 }} />
				</Button>
			)}

			{enableFocalPoint && (
				/* named on the screen (2026-11-02): core's picker shows only the picture and Left / Top, so neither a
				   person nor the chat's pointer could find "Focal point" by its name */
				<FocalPointPicker
					label={__('Focal point', 'gcblite')}
					help={__('Click the spot that should stay in view when the picture is cropped. Zoom moves in towards it.', 'gcblite')}
					url={imageValue.url}
					value={focalPoint}
					onChange={(p) => updateValue({ focalPoint: p })}
				/>
			)}

			{/* A logo in a set is sized by equal area from its own shape; Scale
			    is for a file that reads light or carries its own padding. */}
			{contained === 'logos' && (
				<RangeControl
					label={__('Scale', 'gcblite')}
					help={__('Logos in a set are sized to look equal. Nudge one that still reads too big or too small.', 'gcblite')}
					value={scale}
					min={80}
					max={125}
					step={5}
					withInputField
					allowReset
					resetFallbackValue={100}
					onChange={(v) => updateValue({ scale: Number(v) > 0 ? Number(v) : 100 })}
					__nextHasNoMarginBottom
				/>
			)}

			{/* Zoom fills the frame from closer in, about the focal point —
			    it only means something when the picture covers its frame (a
			    picture with a Shape setting always does; at its own shape it can
			    also be zoomed out). */}
			{enableZoom && size === 'cover' && (
				<RangeControl
					label={__('Zoom', 'gcblite')}
					value={zoom}
					min={zoomMin}
					max={3}
					step={0.05}
					withInputField
					allowReset
					resetFallbackValue={1}
					onChange={(v) => updateValue({ zoom: Number(v) > zoomMin ? Number(v) : Number(v) > 0 ? zoomMin : 1 })}
					__nextHasNoMarginBottom
				/>
			)}

			{enableFixedBackground && (
				<ToggleControl
					label={__('Fixed background', 'gcblite')}
					checked={isFixed}
					onChange={(v) => updateValue({ isFixed: v })}
					__nextHasNoMarginBottom
				/>
			)}

			{enableShape && (
				<SelectControl
					label={__('Shape', 'gcblite')}
					value={ratio}
					options={FLOW_SHAPES.map((o) => ({ value: o.value, label: o.label() }))}
					onChange={(v) => updateValue({ ratio: v })}
					help={ratio ? __('The picture fills this shape, cropped round the focal point.', 'gcblite') : __('The whole picture, nothing cropped.', 'gcblite')}
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				/>
			)}

			{enableSizeOptions && !enableShape && (
				<div className="gcb-image-control-content__sections">
					<ToggleGroupControl
						label={__('Size', 'gcblite')}
						value={size}
						onChange={(v) => {
							if (v === 'cover' || v === 'contain') {
								updateValue({ size: v, repeat: false });
							} else {
								updateValue({ size: v });
							}
						}}
						isBlock
						__nextHasNoMarginBottom
						__next40pxDefaultSize
						help={
							size === 'cover'
								? __('Image covers the space evenly.', 'gcblite')
								: size === 'contain'
								? __('Image is contained without distortion.', 'gcblite')
								: undefined
						}
					>
						<ToggleGroupControlOption value="cover" label={__('Cover', 'gcblite')} />
						<ToggleGroupControlOption value="contain" label={__('Contain', 'gcblite')} />
						{enableTile && <ToggleGroupControlOption value="auto" label={__('Tile', 'gcblite')} />}
					</ToggleGroupControl>

					{(enableTile || enableRepeatOptions) && <HStack spacing={3}>
						{enableTile && <UnitControl
							value={customWidth}
							onChange={(v) => updateValue({ customWidth: v })}
							units={[
								{ value: 'px', label: 'px' },
								{ value: '%', label: '%' },
								{ value: 'em', label: 'em' },
								{ value: 'rem', label: 'rem' },
								{ value: 'vw', label: 'vw' },
								{ value: 'vh', label: 'vh' },
							]}
							placeholder={__('Auto', 'gcblite')}
							min={0}
							step={1}
							disabled={size === 'cover'}
							aria-label={__('Background image width', 'gcblite')}
							__nextHasNoMarginBottom
						/>}
						{enableRepeatOptions && (
							<ToggleControl
								label={__('Repeat', 'gcblite')}
								checked={repeat}
								onChange={(v) => updateValue({ repeat: v })}
								disabled={size === 'cover'}
								__nextHasNoMarginBottom
							/>
						)}
					</HStack>}
				</div>
			)}
		</div>
	);
}

export default function ImageField({ control, value, onChange }) {
	const imageValue = value || {};
	const inline = control.settingsInline === true;

	return (
		<div className="components-base-control gcb-image-control">
			{!inline && (
				<div className="components-base-control__field">
					<label className="components-base-control__label">{control.label}</label>
				</div>
			)}
			{control.helpText && (
				<p className="components-base-control__help">{control.helpText}</p>
			)}

			<MediaCapabilityGate>
				<MediaPicker
					onSelect={(media) => {
						onChange({
							id: media.id,
							url: media.url,
							alt: media.alt || '',
							title: media.title || media.filename || '',
							filename: media.filename || '',
							width: media.width,
							height: media.height,
							filesize: media.filesizeInBytes,
							focalPoint: imageValue.focalPoint || { x: 0.5, y: 0.5 },
							size: imageValue.size || 'cover',
							repeat: imageValue.repeat !== false,
							isFixed: imageValue.isFixed || false,
							customWidth: imageValue.customWidth || '',
							...(imageValue.scale ? { scale: imageValue.scale } : {}),
							...(imageValue.ratio ? { ratio: imageValue.ratio } : {}),
						});
					}}
					allowedTypes={resolveAllowedTypes(control)}
					value={imageValue?.id}
					render={({ open }) => (
						<div className="gcb-image-control-content">
							{!imageValue?.url && (
								<>
									<Button
										onClick={open}
										variant="secondary"
										style={{ marginBottom: 8 }}
									>
										{__('Add image', 'gcblite')}
									</Button>
									<p style={{ fontSize: 13, color: '#757575', margin: 0 }}>
										{__('No image selected', 'gcblite')}
									</p>
								</>
							)}

							{imageValue?.url && inline && (
								<div className="gcb-image-control-content--inline">
									<ImageControlContent
										control={control}
										value={imageValue}
										onChange={onChange}
										onReplace={open}
									/>
									<Button
										variant="link"
										isDestructive
										onClick={() => onChange(null)}
										style={{ marginTop: 12 }}
									>
										{__('Remove image', 'gcblite')}
									</Button>
								</div>
							)}

							{imageValue?.url && !inline && (
								<PopoverOrModal
									modalTitle={control.label || __('Image settings', 'gcblite')}
									dropdownProps={{ popoverProps: { placement: 'left-start' } }}
									renderToggle={({ isOpen, onToggle }) => {
										const displayTitle = imageValue.title || imageValue.filename || imageValue.alt || __('(no description)', 'gcblite');
										return (
											<MediaTriggerBadges onClear={() => onChange(null)}>
												<Button
													onClick={onToggle}
													aria-expanded={isOpen}
													aria-label={__('Image size, position and focal point options.', 'gcblite')}
													className="gcb-modal-toggle-button gcb-image-control-toggle"
													style={TOGGLE_BUTTON_STYLE}
												>
													<HStack spacing={3} justify="flex-start">
														<span
															aria-hidden
															style={{
																width: 32,
																height: 32,
																borderRadius: '100%',
																backgroundImage: `url(${imageValue.url})`,
																backgroundSize: 'cover',
																backgroundPosition: 'center',
																flexShrink: 0,
																border: '1px solid #ddd',
																display: 'block',
															}}
														/>
														<FlexItem>
															<Truncate numberOfLines={1}>{displayTitle}</Truncate>
															<VisuallyHidden>
																{__('Image:', 'gcblite')} {displayTitle}
															</VisuallyHidden>
														</FlexItem>
													</HStack>
												</Button>
											</MediaTriggerBadges>
										);
									}}
									renderContent={({ close }) => (
										<div style={{ padding: 16, minWidth: 280 }}>
											<ImageControlContent
												control={control}
												value={imageValue}
												onChange={onChange}
												onReplace={() => {
													close();
													open();
												}}
											/>
										</div>
									)}
								/>
							)}
						</div>
					)}
				/>
			</MediaCapabilityGate>
		</div>
	);
}

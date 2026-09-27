extends SceneTree
# 离线动画烘焙器：把粒子/雾/光效渲成一层带 alpha 的特效，逐帧落 PNG。
# 用法：godot --path tools/anim-forge -s res://forge.gd --fixed-fps <fps> -- --manifest job.json --frames outdir
# 帧序列交给 forge.py 编成无缝循环的 animated webp；静态底图不进帧，由前端叠在原图上。
#
# 全部画在 SubViewport 里：与真实窗口尺寸解耦，透明底直接带 alpha 通道。

var manifest: Dictionary = {}
var canvas: SubViewport
var stage: Control
var bg: TextureRect
var emitters: Array[CPUParticles2D] = []
var drifts: Array[Control] = []
var flickers: Array[Control] = []
var frame_index: int = 0
var total_frames: int = 0
var fps: float = 20.0
var duration: float = 6.0
var out_dir: String = ""
var stage_size: Vector2 = Vector2(1920, 1080)
var drift_cfg: Dictionary = {}
var overlay: bool = true
var prev_data := PackedByteArray()
var dup_frames: int = 0


func _initialize() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if not args.has("manifest"):
		push_error("forge: missing --manifest <job.json>")
		quit(1)
		return
	var fh := FileAccess.open(args["manifest"], FileAccess.READ)
	if fh == null:
		push_error("forge: cannot open manifest " + str(args["manifest"]))
		quit(1)
		return
	var parsed: Variant = JSON.parse_string(fh.get_as_text())
	fh = null
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("forge: manifest must be a JSON object")
		quit(1)
		return
	manifest = parsed
	out_dir = args.get("frames", "")
	fps = float(manifest.get("fps", 20))
	duration = float(manifest.get("seconds", 6.0))
	# 多渲 preroll 帧供 forge.py 做首尾交叉淡化，循环点才不跳
	total_frames = int(round(fps * duration)) + int(manifest.get("preroll", 0))
	var sz: Array = manifest.get("size", [1920, 1080])
	stage_size = Vector2(float(sz[0]), float(sz[1]))
	overlay = bool(manifest.get("overlay", true))
	drift_cfg = manifest.get("drift", {})
	_build()
	print("forge: %s frames=%d size=%s overlay=%s effects=%s" % [
		str(args.get("manifest", "?")), total_frames, str(stage_size),
		str(overlay), str(_kinds())])


func _kinds() -> Array:
	var out: Array = []
	for e in manifest.get("effects", []):
		out.append(e.get("type", "?"))
	return out


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var i := 0
	while i < args.size():
		if args[i].begins_with("--") and i + 1 < args.size():
			out[args[i].trim_prefix("--")] = args[i + 1]
			i += 2
		else:
			i += 1
	return out


func _build() -> void:
	canvas = SubViewport.new()
	canvas.size = Vector2i(int(stage_size.x), int(stage_size.y))
	canvas.transparent_bg = overlay
	canvas.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	canvas.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	# 必须挂进 SubViewportContainer：没有任何东西绘制它的话，Godot 不刷新其目标，
	# 抓到的帧序列会大段字节相同（实测 140 帧里 109 帧重复）。
	var holder := SubViewportContainer.new()
	holder.stretch = true
	holder.size = stage_size
	root.add_child(holder)
	holder.add_child(canvas)

	stage = Control.new()
	stage.size = stage_size
	canvas.add_child(stage)

	if not overlay:
		bg = TextureRect.new()
		bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		bg.size = stage_size
		var src: String = manifest.get("src", "")
		if src != "" and FileAccess.file_exists(src):
			var img := Image.load_from_file(ProjectSettings.globalize_path(src))
			if img != null:
				bg.texture = ImageTexture.create_from_image(img)
			else:
				push_warning("forge: cannot decode " + src)
		elif src != "":
			push_warning("forge: no such source " + src)
		stage.add_child(bg)

	for e in manifest.get("effects", []):
		match e.get("type", ""):
			"particles": _add_particles(e)
			"mist": _add_mist(e)
			"shaft": _add_shaft(e)
			"flicker": _add_flicker(e)
			"drift": drift_cfg = e.get("params", {})
			_: push_warning("forge: unknown effect " + str(e.get("type", "")))


func _soft_disc(diameter: int, soft: float) -> Texture2D:
	var img := Image.create(diameter, diameter, false, Image.FORMAT_RGBA8)
	var r := float(diameter) * 0.5
	for y in diameter:
		for x in diameter:
			var d: float = Vector2(x - r + 0.5, y - r + 0.5).length() / r
			var a: float = clampf(1.0 - (d - (1.0 - soft)) / maxf(soft, 0.004), 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, a * a))
	return ImageTexture.create_from_image(img)


func _alpha_ramp(tint: Color, fade: float) -> Gradient:
	var g := Gradient.new()
	g.colors = PackedColorArray([
		Color(tint.r, tint.g, tint.b, 0.0), tint, tint,
		Color(tint.r, tint.g, tint.b, 0.0)])
	g.offsets = PackedFloat32Array([0.0, 0.14, 1.0 - fade, 1.0])
	return g


func _additive(item: CanvasItem) -> void:
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	item.material = m


func _add_particles(e: Dictionary) -> void:
	var p: Dictionary = e.get("params", {})
	var n := CPUParticles2D.new()
	n.amount = int(p.get("amount", 90))
	var want_life := float(p.get("lifetime", duration))
	n.lifetime = duration / maxf(1.0, round(duration / want_life))
	n.preprocess = n.lifetime
	n.emitting = true
	n.seed = int(p.get("seed", 20260927))
	n.local_coords = false
	n.draw_order = CPUParticles2D.DRAW_ORDER_INDEX
	n.direction = Vector2(float(p.get("dir_x", 0.0)), float(p.get("dir_y", 1.0)))
	n.spread = float(p.get("spread", 10.0))
	n.gravity = Vector2(float(p.get("grav_x", 0.0)), float(p.get("grav_y", 0.0)))
	n.initial_velocity_min = float(p.get("vel_min", 30.0))
	n.initial_velocity_max = float(p.get("vel_max", 70.0))
	n.scale_amount_min = float(p.get("scale_min", 0.4))
	n.scale_amount_max = float(p.get("scale_max", 1.0))
	n.angular_velocity_min = float(p.get("spin_min", -14.0))
	n.angular_velocity_max = float(p.get("spin_max", 14.0))
	n.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	n.emission_rect_extents = Vector2(stage_size.x * float(p.get("w", 0.62)),
			stage_size.y * float(p.get("h", 0.18)))
	n.position = Vector2(stage_size.x * float(p.get("x", 0.5)), stage_size.y * float(p.get("y", -0.15)))
	var c: Array = p.get("color", [1, 1, 1, 0.9])
	n.color_ramp = _alpha_ramp(Color(c[0], c[1], c[2], c[3]), float(p.get("fade", 0.35)))
	var sprite_file: String = str(p.get("sprite_file", ""))
	if sprite_file != "" and FileAccess.file_exists(sprite_file):
		n.texture = ImageTexture.create_from_image(Image.load_from_file(sprite_file))
	else:
		if sprite_file != "":
			push_warning("forge: no such sprite " + sprite_file)
		n.texture = _soft_disc(int(p.get("sprite", 24)), float(p.get("soft", 0.7)))
	if bool(p.get("additive", false)):
		_additive(n)
	stage.add_child(n)
	emitters.append(n)


# 雾：几片超大软斑横向慢漂，位置按周期回卷，天然接近无缝
func _add_mist(e: Dictionary) -> void:
	var p: Dictionary = e.get("params", {})
	var tex := _soft_disc(256, float(p.get("soft", 0.95)))
	var count := int(p.get("count", 5))
	var c: Array = p.get("color", [1, 1, 1, 0.10])
	for i in count:
		var t := TextureRect.new()
		t.texture = tex
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_SCALE
		var w := stage_size.x * float(p.get("scale", 0.9)) * (0.7 + 0.6 * float(i % 3))
		t.size = Vector2(w, w * float(p.get("ratio", 0.32)))
		t.modulate = Color(c[0], c[1], c[2], c[3])
		if bool(p.get("additive", false)):
			_additive(t)
		t.set_meta("speed", float(p.get("speed", 26.0)) * (0.7 + 0.24 * float(i % 4)))
		t.set_meta("y", stage_size.y * (float(p.get("y", 0.6)) + 0.09 * float(i % 5)))
		t.set_meta("phase", float(i) / float(count))
		stage.add_child(t)
		drifts.append(t)


func _add_shaft(e: Dictionary) -> void:
	var p: Dictionary = e.get("params", {})
	var grad := Gradient.new()
	var c: Array = p.get("color", [1.0, 0.93, 0.78, 0.5])
	grad.colors = PackedColorArray([Color(c[0], c[1], c[2], 0.0), Color(c[0], c[1], c[2], c[3]),
			Color(c[0], c[1], c[2], 0.0)])
	grad.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	var gt := GradientTexture1D.new()
	gt.gradient = grad
	gt.width = 64
	var t := TextureRect.new()
	t.texture = ImageTexture.create_from_image(gt.get_image())
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_SCALE
	t.size = Vector2(float(p.get("width", 300.0)), stage_size.y * 2.2)
	t.position = Vector2(stage_size.x * float(p.get("x", 0.5)) - t.size.x * 0.5, -stage_size.y * 0.6)
	t.pivot_offset = t.size * 0.5
	t.rotation_degrees = float(p.get("angle", 0.0))
	t.modulate.a = float(p.get("strength", 0.5))
	_additive(t)
	t.set_meta("base", float(p.get("strength", 0.5)))
	t.set_meta("hz", float(p.get("hz", 0.6)))
	stage.add_child(t)
	flickers.append(t)


func _add_flicker(e: Dictionary) -> void:
	var p: Dictionary = e.get("params", {})
	var c: Array = p.get("color", [1.0, 0.78, 0.5, 1.0])
	var r := ColorRect.new()
	r.size = stage_size
	r.color = Color(c[0], c[1], c[2], 0.0)
	_additive(r)
	r.set_meta("base", float(p.get("amplitude", 0.08)))
	r.set_meta("hz", float(p.get("hz", 1.7)))
	stage.add_child(r)
	flickers.append(r)


func _process(_delta: float) -> bool:
	if frame_index >= total_frames:
		print("forge: done %d frames, %d identical to previous" % [total_frames, dup_frames])
		quit(0)
		return true
	var t := float(frame_index) / fps
	var phase := fmod(t, duration) / duration

	if bg != null:
		var pan := float(drift_cfg.get("pan", 0.0))
		var zoom := 1.0 + float(drift_cfg.get("zoom", 0.0)) * 0.5 * (1.0 - cos(TAU * phase))
		bg.pivot_offset = bg.size * 0.5
		bg.scale = Vector2(zoom, zoom)
		bg.position = (stage_size - bg.size * zoom) * 0.5 \
				+ Vector2(pan * cos(TAU * phase), pan * 0.55 * sin(TAU * phase))

	for d in drifts:
		var span: float = stage_size.x + d.size.x
		d.position.x = fmod(float(d.get_meta("speed")) * t + float(d.get_meta("phase")) * span, span) - d.size.x
		d.position.y = float(d.get_meta("y")) - d.size.y * 0.5

	for r in flickers:
		var base: float = float(r.get_meta("base"))
		var hz: float = float(r.get_meta("hz"))
		var wob := sin(TAU * hz * phase) * 0.6 + sin(TAU * hz * 2.63 * phase + 1.7) * 0.4
		if r is ColorRect:
			var col: Color = r.color
			col.a = maxf(0.0, base * (0.5 + 0.5 * wob))
			r.color = col
		else:
			r.modulate.a = maxf(0.0, base * (0.72 + 0.28 * wob))

	if out_dir != "":
		var img := canvas.get_texture().get_image()
		var data := img.get_data()
		if data == prev_data:
			dup_frames += 1
		prev_data = data
		img.save_png("%s/f_%05d.png" % [out_dir, frame_index])
		if frame_index % 40 == 0:
			print("forge: %d/%d" % [frame_index, total_frames])
	frame_index += 1
	return false

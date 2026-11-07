package net.pvphouse.autologin.cosmetics;

import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;

import java.util.HashMap;
import java.util.Map;

/**
 * Hat and wing geometry. Texture offsets match the PNGs generated for the mod (64x32 each).
 * Hats are in head space (head box spans y -8..0), wings in body space (back face at z = +2).
 */
public final class CosmeticModels {
	private static final Map<String, ModelPart> CACHE = new HashMap<>();

	private CosmeticModels() {}

	public static ModelPart hat(String id) {
		return CACHE.computeIfAbsent("hat/" + id, k -> build(id));
	}

	public static ModelPart wings(String id) {
		return CACHE.computeIfAbsent("wings/" + id, k -> buildWings());
	}

	private static ModelPart build(String id) {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		switch (id) {
			case "tophat" -> {
				root.addOrReplaceChild("brim", CubeListBuilder.create().texOffs(0, 0)
						.addBox(-5.5F, -8.6F, -5.5F, 11, 1, 11), PartPose.ZERO);
				root.addOrReplaceChild("top", CubeListBuilder.create().texOffs(0, 12)
						.addBox(-3.5F, -15.6F, -3.5F, 7, 7, 7), PartPose.ZERO);
				root.addOrReplaceChild("band", CubeListBuilder.create().texOffs(32, 12)
						.addBox(-3.5F, -10.6F, -3.5F, 7, 1, 7, new CubeDeformation(0.25F)), PartPose.ZERO);
			}
			case "crown" -> {
				root.addOrReplaceChild("ring", CubeListBuilder.create().texOffs(0, 0)
						.addBox(-4.5F, -10.6F, -4.5F, 9, 2, 9), PartPose.ZERO);
				CubeListBuilder spikes = CubeListBuilder.create().texOffs(40, 0);
				float[][] at = {{-4.5F, -4.5F}, {3.5F, -4.5F}, {-4.5F, 3.5F}, {3.5F, 3.5F},
						{-0.5F, -4.5F}, {-0.5F, 3.5F}, {-4.5F, -0.5F}, {3.5F, -0.5F}};
				for (float[] p : at) spikes.addBox(p[0], -12.6F, p[1], 1, 2, 1);
				root.addOrReplaceChild("spikes", spikes, PartPose.ZERO);
				root.addOrReplaceChild("gem", CubeListBuilder.create().texOffs(48, 0)
						.addBox(-0.5F, -10.1F, -4.9F, 1, 1, 1), PartPose.ZERO);
			}
			case "horns" -> {
				for (int side = -1; side <= 1; side += 2) {
					PartDefinition horn = root.addOrReplaceChild(side < 0 ? "right" : "left",
							CubeListBuilder.create().texOffs(0, 0).addBox(-1F, -3F, -1F, 2, 3, 2),
							PartPose.offsetAndRotation(side * 2.5F, -7.5F, -1.5F, -0.2F, 0F, side * 0.35F));
					horn.addOrReplaceChild("tip", CubeListBuilder.create().texOffs(0, 8)
							.addBox(-0.5F, -2F, -0.5F, 1, 2, 1),
							PartPose.offsetAndRotation(0F, -3F, 0F, -0.25F, 0F, side * 0.25F));
				}
			}
			default -> { }
		}
		return LayerDefinition.create(mesh, 64, 32).bakeRoot();
	}

	private static ModelPart buildWings() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		root.addOrReplaceChild("left", CubeListBuilder.create().texOffs(0, 0)
				.addBox(0F, 0F, 0F, 12, 14, 1), PartPose.offset(1F, 1F, 2.5F));
		root.addOrReplaceChild("right", CubeListBuilder.create().texOffs(0, 16)
				.addBox(-12F, 0F, 0F, 12, 14, 1), PartPose.offset(-1F, 1F, 2.5F));
		return LayerDefinition.create(mesh, 64, 32).bakeRoot();
	}
}

package net.pvphouse.autologin.cosmetics;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;

/** Draws the selected hat and wings on the local player only. */
public class CosmeticsLayer extends RenderLayer<AvatarRenderState, PlayerModel> {

	public CosmeticsLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
		super(parent);
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, AvatarRenderState state,
					   float yRot, float xRot) {
		if (state.isInvisible || state.isSpectator || !Cosmetics.isLocalPlayer(state.id)) return;

		String hat = Cosmetics.hat();
		if (hat != null) {
			poseStack.pushPose();
			getParentModel().head.translateAndRotate(poseStack);
			collector.submitModelPart(CosmeticModels.hat(hat), poseStack,
					RenderTypes.entityCutoutNoCull(Cosmetics.texture("hat", hat)), light, OverlayTexture.NO_OVERLAY, null);
			poseStack.popPose();
		}

		String wings = Cosmetics.wings();
		// Hidden while gliding with an elytra (the elytra takes that space)
		if (wings != null && state.fallFlyingTimeInTicks <= 0F) {
			ModelPart model = CosmeticModels.wings(wings);
			float flap = Mth.sin(state.ageInTicks * 0.12F) * 0.12F;
			ModelPart left = model.getChild("left");
			ModelPart right = model.getChild("right");
			left.yRot = -(0.55F + flap);
			right.yRot = 0.55F + flap;
			left.zRot = -0.15F;
			right.zRot = 0.15F;
			poseStack.pushPose();
			getParentModel().body.translateAndRotate(poseStack);
			collector.submitModelPart(model, poseStack,
					RenderTypes.entityCutoutNoCull(Cosmetics.texture("wings", wings)), light, OverlayTexture.NO_OVERLAY, null);
			poseStack.popPose();
		}
	}
}

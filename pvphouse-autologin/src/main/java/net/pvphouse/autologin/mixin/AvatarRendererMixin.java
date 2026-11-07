package net.pvphouse.autologin.mixin;

import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.pvphouse.autologin.cosmetics.CosmeticsLayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Adds the PvPHouse hat/wings layer to every player renderer (it only draws on the local player). */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {
	@SuppressWarnings("unchecked")
	@Inject(method = "<init>", at = @At("TAIL"))
	private void pvphouse$addCosmeticsLayer(EntityRendererProvider.Context context, boolean slim, CallbackInfo ci) {
		RenderLayerParent<AvatarRenderState, PlayerModel> parent = (RenderLayerParent<AvatarRenderState, PlayerModel>) (Object) this;
		((LivingEntityRendererInvoker) (Object) this).pvphouse$addLayer(new CosmeticsLayer(parent));
	}
}

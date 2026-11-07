package net.pvphouse.autologin.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;
import net.pvphouse.autologin.cosmetics.Cosmetics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Gives the local player the selected PvPHouse cape (also used as the elytra texture). */
@Mixin(AbstractClientPlayer.class)
public abstract class AbstractClientPlayerMixin {
	@Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
	private void pvphouse$cape(CallbackInfoReturnable<PlayerSkin> cir) {
		String cape = Cosmetics.cape();
		if (cape == null || (Object) this != Minecraft.getInstance().player) return;
		PlayerSkin skin = cir.getReturnValue();
		if (skin == null) return;
		Identifier location = Cosmetics.texture("cape", cape);
		ClientAsset.ResourceTexture texture = new ClientAsset.ResourceTexture(location, location);
		cir.setReturnValue(new PlayerSkin(skin.body(), texture, texture, skin.model(), skin.secure()));
	}
}

package net.pvphouse.autologin.mixin;

import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundLoginPacket;
import net.pvphouse.autologin.PvPHouseAutoLogin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Fires once the player has joined a world on a server (the "login" game packet was handled). */
@Mixin(ClientPacketListener.class)
public abstract class ClientPacketListenerMixin {
	@Inject(method = "handleLogin", at = @At("TAIL"))
	private void pvphouse$onJoin(ClientboundLoginPacket packet, CallbackInfo ci) {
		PvPHouseAutoLogin.onJoinedServer((ClientPacketListener) (Object) this);
	}
}

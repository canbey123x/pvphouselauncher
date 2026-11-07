package net.pvphouse.autologin.mixin;

import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundLoginPacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.pvphouse.autologin.PvPHouseAutoLogin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientPacketListener.class)
public abstract class ClientPacketListenerMixin {
	/** Fires once the player has joined a world on a server (the "login" game packet was handled). */
	@Inject(method = "handleLogin", at = @At("TAIL"))
	private void pvphouse$onJoin(ClientboundLoginPacket packet, CallbackInfo ci) {
		PvPHouseAutoLogin.onJoinedServer((ClientPacketListener) (Object) this);
	}

	/** Server (system) chat messages: AuthMe asks for /login or /register here. */
	@Inject(method = "handleSystemChat", at = @At("TAIL"))
	private void pvphouse$onSystemChat(ClientboundSystemChatPacket packet, CallbackInfo ci) {
		PvPHouseAutoLogin.onSystemMessage((ClientPacketListener) (Object) this, packet.content().getString());
	}
}

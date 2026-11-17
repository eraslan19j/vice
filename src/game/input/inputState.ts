/** Mutable touch input shared by MobileControls (writer) and the game loop (reader).
 *  Plain object, NOT React state: touches never trigger React re-renders. */
export interface InputState {
  moveX: number; // -1..1 (right +)
  moveY: number; // -1..1 (forward +)
  lookDX: number; // accumulated drag pixels since last frame
  lookDY: number;
  fire: boolean;
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
  sprint: boolean;
  jumpQueued: boolean;
  interactQueued: boolean;
  hornQueued: boolean;
  lightsQueued: boolean;
  radioQueued: boolean;
  weaponQueued: boolean;
}

export const createInputState = (): InputState => ({
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
  fire: false,
  gas: false,
  brake: false,
  handbrake: false,
  sprint: false,
  jumpQueued: false,
  interactQueued: false,
  hornQueued: false,
  lightsQueued: false,
  radioQueued: false,
  weaponQueued: false,
});

export const resetInput = (i: InputState) => {
  i.moveX = i.moveY = i.lookDX = i.lookDY = 0;
  i.fire = i.gas = i.brake = i.handbrake = i.sprint = false;
  i.jumpQueued = i.interactQueued = i.hornQueued = i.lightsQueued = i.radioQueued = i.weaponQueued = false;
};

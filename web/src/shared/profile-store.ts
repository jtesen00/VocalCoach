import { emptyProfile, type VocalProfile } from '../core/profile/vocal-profile';
import { createLocalStore } from './local-store';

/** Perfil vocal del usuario: aprende de cada ejercicio y frase cantada. */
export const profileStore = createLocalStore<VocalProfile>('vocalcoach.profile.v1', emptyProfile);

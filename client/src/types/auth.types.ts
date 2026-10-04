export type LoginRole = 'patient' | 'doctor' | 'admin';

export interface LoginFormProps {
  role: LoginRole;
}

export type SignupRole = 'patient' | 'hospital';

export interface SignupFormProps {
  role: SignupRole;
}

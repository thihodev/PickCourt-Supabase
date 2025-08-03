import { UserRepository } from '../repositories/UserRepository';
import { JwtService, TokenPair } from '../utils/jwt';
import { User, CreateUser } from '../types';
import { AuthenticationError, ValidationError } from '../middlewares/errorHandler';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import nodemailer from 'nodemailer';

export interface LoginCredentials {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

export class AuthService {
  private userRepository: UserRepository;
  private mailTransporter: nodemailer.Transporter;

  constructor() {
    this.userRepository = new UserRepository();
    
    // Configure mail transporter
    this.mailTransporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: process.env.MAIL_PORT === '465',
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Find user by email or phone
    let user: User | null = null;
    
    if (credentials.email) {
      user = await this.userRepository.findByEmail(credentials.email);
    } else if (credentials.phone) {
      user = await this.userRepository.findByPhone(credentials.phone);
    }

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new AuthenticationError('Account is inactive');
    }

    // Generate tokens
    const tokens = JwtService.generateTokenPair({
      userId: user.id,
      email: user.email || undefined,
    });

    return { user, tokens };
  }

  async register(userData: RegisterData): Promise<AuthResponse> {
    // Check if user already exists
    if (userData.email) {
      const existingUser = await this.userRepository.findByEmail(userData.email);
      if (existingUser) {
        throw new ValidationError('Email already registered');
      }
    }

    if (userData.phone) {
      const existingUser = await this.userRepository.findByPhone(userData.phone);
      if (existingUser) {
        throw new ValidationError('Phone number already registered');
      }
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const userToCreate: CreateUser = {
      ...userData,
      password: hashedPassword,
    };
    const user = await this.userRepository.createUser(userToCreate);

    // Generate tokens
    const tokens = JwtService.generateTokenPair({
      userId: user.id,
      email: user.email || undefined,
    });

    return { user, tokens };
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = JwtService.verifyRefreshToken(refreshToken);
      
      // Verify user still exists and is active
      const user = await this.userRepository.findById(payload.userId);
      if (user.status !== 'active') {
        throw new AuthenticationError('User is inactive');
      }

      // Generate new token pair
      return JwtService.generateTokenPair({
        userId: user.id,
        email: user.email || undefined,
        tenantId: payload.tenantId,
      });
    } catch (error) {
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists for security
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Store token in user record (you might want a separate password_reset_tokens table)
    await this.userRepository.updateUser(user.id, {
      remember_token: hashedToken,
    });

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${email}`;
    
    await this.mailTransporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset for your PickCourt account.</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });
  }

  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid reset token');
    }

    // Hash the provided token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    if (user.remember_token !== hashedToken) {
      throw new AuthenticationError('Invalid reset token');
    }

    // Hash new password and update user
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.updateUser(user.id, {
      password: hashedPassword,
      remember_token: undefined,
    });
  }

  async getCurrentUser(userId: number): Promise<User> {
    return this.userRepository.findById(userId);
  }
}
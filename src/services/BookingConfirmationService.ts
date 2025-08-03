import { TeamService } from './TeamService.ts'
import { MatchService } from './MatchService.ts'
import { BookedSlotService } from './BookedSlotService.ts'
import type { Booking } from '../types/database.types.ts'

export interface CreateTeamsForBookingInput {
  tenantId: string
  bookingId: string
  courtName?: string
  customerId: string
  createdBy: string
}

export interface CreateMatchInput {
  tenantId: string
  bookingId: string
  teamOneId: string
  teamTwoId: string
  matchDate: string
  courtId: string
  courtName?: string
  clubName?: string
  createdBy: string
}

export interface CreateBookedSlotInput {
  bookingId: string
  courtId: string
  startTime: string
  endTime: string
  price: number
  matchId?: string | null
  confirmedBy: string
  metadata?: Record<string, any>
}

export interface BookingConfirmationInput {
  booking: Booking & {
    court: {
      id: string
      name: string
      club: {
        name: string
        tenant_id: string
      }
    }
  }
  confirmedBy: string
  tenantId: string
  paymentMethod?: string
  paymentReference?: string
  notes?: string
}

export interface BookingConfirmationResult {
  bookedSlot: any
  teams: any
  match: any
  matchCreated: boolean
  teamsCreated: boolean
}

export class BookingConfirmationService {
  private teamService = new TeamService()
  private matchService = new MatchService()
  private bookedSlotService = new BookedSlotService()

  async confirmBooking(input: BookingConfirmationInput): Promise<BookingConfirmationResult> {
    const { booking, confirmedBy, tenantId } = input
    
    let teams = null
    let match = null
    let matchCreated = false
    let teamsCreated = false

    try {
      // 1. Create teams for the match
      const teamsInput = {
        tenantId,
        bookingId: booking.id,
        courtName: booking.metadata?.court_name || booking.court.name,
        customerId: booking.user_id,
        createdBy: confirmedBy
      }

      teams = await this.teamService.createTeamsForBooking(teamsInput)
      teamsCreated = true

      // 2. Create match
      const matchInput = {
        tenantId,
        bookingId: booking.id,
        teamOneId: teams.teamOne.id,
        teamTwoId: teams.teamTwo.id,
        matchDate: booking.start_time,
        courtId: booking.court_id,
        courtName: booking.metadata?.court_name || booking.court.name,
        clubName: booking.metadata?.club_name || booking.court.club.name,
        createdBy: confirmedBy
      }

      match = await this.matchService.createMatch(matchInput)
      matchCreated = true

    } catch (error) {
      console.error('Error creating teams/match:', error)
      // Continue with booking confirmation even if teams/match creation fails
    }

    // 3. Create booked slot (always create this)
    const bookedSlotInput = {
      bookingId: booking.id,
      courtId: booking.court_id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      price: booking.total_amount,
      matchId: match?.id || null,
      confirmedBy,
      metadata: {
        booking_type: booking.booking_type,
        original_metadata: booking.metadata,
        teams_created: teamsCreated,
        match_created: matchCreated
      }
    }

    const bookedSlot = await this.bookedSlotService.createBookedSlot(bookedSlotInput)

    return {
      bookedSlot,
      teams,
      match,
      matchCreated,
      teamsCreated
    }
  }

  async getBookingDetails(bookingId: string) {
    try {
      const [teams, match, slots] = await Promise.all([
        this.teamService.getTeamsByBooking(bookingId),
        this.matchService.getMatchByBooking(bookingId),
        this.bookedSlotService.getSlotsByBooking(bookingId)
      ])

      return {
        teams,
        match,
        bookedSlots: slots
      }
    } catch (error) {
      console.error('Error getting booking details:', error)
      throw error
    }
  }

  async invitePlayerToTeam(teamId: string, playerType: 'player_one' | 'player_two', playerId: string) {
    try {
      await this.teamService.updateTeamPlayer(teamId, playerType, playerId)
      return { success: true }
    } catch (error) {
      console.error('Error inviting player to team:', error)
      throw error
    }
  }
}
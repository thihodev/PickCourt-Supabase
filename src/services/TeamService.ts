import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import type { TeamInsert, Team } from '../types/database.types.ts'

export interface CreateTeamsForBookingInput {
  tenantId: string
  bookingId: string
  courtName?: string
  customerId: string
  createdBy: string
}

export interface CreateTeamsResult {
  teamOne: Team
  teamTwo: Team
}

export class TeamService {
  private supabase = createSupabaseAdminClient()

  async createTeamsForBooking(input: CreateTeamsForBookingInput): Promise<CreateTeamsResult> {
    const { tenantId, bookingId, courtName, customerId, createdBy } = input
    const now = new Date().toISOString()

    const teamOneData: TeamInsert = {
      name: `Team 1 - ${courtName || 'Court'}`,
      player_one_id: customerId,
      player_two_id: customerId, // Temporary, will be updated later
      metadata: {
        created_for_booking: bookingId,
        created_at: now,
        created_by: createdBy,
        team_type: 'team_one',
        needs_player_two: true
      }
    }

    const teamTwoData: TeamInsert = {
      name: `Team 2 - ${courtName || 'Court'}`,
      player_one_id: customerId, // Temporary, will be updated later
      player_two_id: customerId, // Temporary, will be updated later
      metadata: {
        created_for_booking: bookingId,
        created_at: now,
        created_by: createdBy,
        team_type: 'team_two',
        needs_player_one: true,
        needs_player_two: true
      }
    }

    const { data: teams, error } = await this.supabase
      .from('teams')
      .insert([teamOneData, teamTwoData])
      .select('*')

    if (error) {
      throw new Error(`Failed to create teams: ${error.message}`)
    }

    if (!teams || teams.length !== 2) {
      throw new Error('Failed to create both teams')
    }

    return {
      teamOne: teams[0],
      teamTwo: teams[1]
    }
  }

  async updateTeamPlayer(teamId: string, playerType: 'player_one' | 'player_two', playerId: string): Promise<void> {
    const updateData: any = {
      [playerType + '_id']: playerId,
      updated_at: new Date().toISOString()
    }

    // Update metadata to remove needs_player flag
    const { data: team } = await this.supabase
      .from('teams')
      .select('metadata')
      .eq('id', teamId)
      .single()

    if (team?.metadata) {
      const metadata = { ...team.metadata }
      delete metadata[`needs_${playerType}`]
      updateData.metadata = metadata
    }

    const { error } = await this.supabase
      .from('teams')
      .update(updateData)
      .eq('id', teamId)

    if (error) {
      throw new Error(`Failed to update team player: ${error.message}`)
    }
  }

  async getTeamsByBooking(bookingId: string): Promise<Team[]> {
    const { data, error } = await this.supabase
      .from('teams')
      .select('*')
      .eq('metadata->>created_for_booking', bookingId)

    if (error) {
      throw new Error(`Failed to get teams: ${error.message}`)
    }

    return data || []
  }
}
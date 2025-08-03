import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import type { MatchInsert, Match } from '../types/database.types.ts'

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

export class MatchService {
  private supabase = createSupabaseAdminClient()

  async createMatch(input: CreateMatchInput): Promise<Match> {
    const {
      tenantId,
      bookingId,
      teamOneId,
      teamTwoId,
      matchDate,
      courtId,
      courtName,
      clubName,
      createdBy
    } = input

    const matchData: MatchInsert = {
      tenant_id: tenantId,
      booking_id: bookingId,
      team_one_id: teamOneId,
      team_two_id: teamTwoId,
      status: 'scheduled',
      match_date: matchDate,
      metadata: {
        created_at: new Date().toISOString(),
        created_by: createdBy,
        court_id: courtId,
        court_name: courtName,
        club_name: clubName,
        auto_created: true
      }
    }

    const { data: match, error } = await this.supabase
      .from('matches')
      .insert(matchData)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to create match: ${error.message}`)
    }

    return match
  }

  async updateMatchStatus(matchId: string, status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit'): Promise<void> {
    const { error } = await this.supabase
      .from('matches')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', matchId)

    if (error) {
      throw new Error(`Failed to update match status: ${error.message}`)
    }
  }

  async getMatchByBooking(bookingId: string): Promise<Match | null> {
    const { data, error } = await this.supabase
      .from('matches')
      .select(`
        *,
        team_one:teams!team_one_id(*),
        team_two:teams!team_two_id(*)
      `)
      .eq('booking_id', bookingId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No match found
      }
      throw new Error(`Failed to get match: ${error.message}`)
    }

    return data
  }

  async getMatchesByTenant(tenantId: string, filters?: {
    status?: string
    startDate?: string
    endDate?: string
    courtId?: string
  }): Promise<Match[]> {
    let query = this.supabase
      .from('matches')
      .select(`
        *,
        team_one:teams!team_one_id(*),
        team_two:teams!team_two_id(*),
        booking:bookings(
          id,
          start_time,
          end_time,
          court:courts(id, name)
        )
      `)
      .eq('tenant_id', tenantId)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.startDate) {
      query = query.gte('match_date', filters.startDate)
    }

    if (filters?.endDate) {
      query = query.lte('match_date', filters.endDate)
    }

    if (filters?.courtId) {
      query = query.eq('metadata->>court_id', filters.courtId)
    }

    query = query.order('match_date', { ascending: true })

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to get matches: ${error.message}`)
    }

    return data || []
  }
}
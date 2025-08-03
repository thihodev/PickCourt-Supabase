import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import type { Booking } from '../types/database.types.ts'

export interface BookingWithCourt extends Booking {
  court: {
    id: string
    name: string
    hourly_rate: number
    club: {
      id: string
      name: string
      tenant_id: string
    }
  }
}

export class BookingRetrievalService {
  private supabase = createSupabaseAdminClient()

  async getBookingById(bookingId: string): Promise<BookingWithCourt | null> {
    const { data: booking, error } = await this.supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at,
        court:courts(
          id,
          name,
          hourly_rate,
          club:clubs(
            id,
            name,
            tenant_id
          )
        )
      `)
      .eq('id', bookingId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No booking found
      }
      throw new Error(`Failed to get booking: ${error.message}`)
    }

    return booking as BookingWithCourt
  }

  async getBookingsByUser(userId: string, tenantId: string, filters?: {
    status?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<BookingWithCourt[]> {
    let query = this.supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at,
        court:courts(
          id,
          name,
          hourly_rate,
          club:clubs(
            id,
            name,
            tenant_id
          )
        )
      `)
      .eq('user_id', userId)
      .eq('court.club.tenant_id', tenantId)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.startDate) {
      query = query.gte('start_time', filters.startDate)
    }

    if (filters?.endDate) {
      query = query.lte('end_time', filters.endDate)
    }

    query = query.order('start_time', { ascending: false })

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to get user bookings: ${error.message}`)
    }

    return (data || []) as BookingWithCourt[]
  }

  async getBookingsByCourt(courtId: string, date: string): Promise<BookingWithCourt[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at,
        court:courts(
          id,
          name,
          hourly_rate,
          club:clubs(
            id,
            name,
            tenant_id
          )
        )
      `)
      .eq('court_id', courtId)
      .gte('start_time', `${date} 00:00:00`)
      .lte('end_time', `${date} 23:59:59`)
      .neq('status', 'cancelled')
      .order('start_time')

    if (error) {
      throw new Error(`Failed to get court bookings: ${error.message}`)
    }

    return (data || []) as BookingWithCourt[]
  }

  async updateBookingStatus(
    bookingId: string, 
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled',
    metadata?: Record<string, any>
  ): Promise<Booking> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (metadata) {
      // Get existing metadata first
      const { data: existingBooking } = await this.supabase
        .from('bookings')
        .select('metadata')
        .eq('id', bookingId)
        .single()

      updateData.metadata = {
        ...existingBooking?.metadata,
        ...metadata
      }
    }

    const { data: updatedBooking, error } = await this.supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select(`
        id,
        court_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at
      `)
      .single()

    if (error) {
      throw new Error(`Failed to update booking: ${error.message}`)
    }

    return updatedBooking
  }

  async getBookingsByTenant(tenantId: string, filters?: {
    status?: string
    startDate?: string
    endDate?: string
    courtId?: string
    userId?: string
    page?: number
    limit?: number
  }): Promise<BookingWithCourt[]> {
    let query = this.supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at,
        court:courts(
          id,
          name,
          hourly_rate,
          club:clubs(
            id,
            name,
            tenant_id
          )
        )
      `)
      .eq('court.club.tenant_id', tenantId)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.courtId) {
      query = query.eq('court_id', filters.courtId)
    }

    if (filters?.userId) {
      query = query.eq('user_id', filters.userId)
    }

    if (filters?.startDate) {
      query = query.gte('start_time', filters.startDate)
    }

    if (filters?.endDate) {
      query = query.lte('end_time', filters.endDate)
    }

    query = query.order('start_time', { ascending: false })

    if (filters?.page && filters?.limit) {
      const from = (filters.page - 1) * filters.limit
      const to = from + filters.limit - 1
      query = query.range(from, to)
    } else if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to get tenant bookings: ${error.message}`)
    }

    return (data || []) as BookingWithCourt[]
  }
}
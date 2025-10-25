import type { Request, Response } from 'express';
import { prisma } from '../prismaClient';

export const getApartments = async (req: Request, res: Response) => {
  try {
    const apartments = await prisma.apartment.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        tenants: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { floor: 'asc' },
        { unit: 'asc' }
      ]
    });

    res.json(apartments);
  } catch (error) {
    console.error('Error fetching apartments:', error);
    res.status(500).json({ 
      message: 'Error al obtener los apartamentos',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getApartmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ message: 'ID del apartamento es requerido' });
    }
    
    const apartment = await prisma.apartment.findUnique({
      where: { id: parseInt(id) },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        tenants: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!apartment) {
      return res.status(404).json({ message: 'Apartamento no encontrado' });
    }

    res.json(apartment);
  } catch (error) {
    console.error('Error fetching apartment:', error);
    res.status(500).json({ 
      message: 'Error al obtener el apartamento',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

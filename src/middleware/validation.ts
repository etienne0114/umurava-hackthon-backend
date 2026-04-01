import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { APIError } from './errorHandler';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      const validationError: APIError = new Error('Validation failed');
      validationError.statusCode = 400;
      validationError.code = 'VALIDATION_ERROR';
      validationError.details = details;

      next(validationError);
    } else {
      next();
    }
  };
};

export const jobSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().min(10).max(5000).required(),
  requirements: Joi.object({
    skills: Joi.array().items(Joi.string()).min(1).required(),
    experience: Joi.object({
      minYears: Joi.number().min(0).max(50).required(),
      maxYears: Joi.number().min(0).max(50).optional(),
    }).required(),
    education: Joi.array().items(Joi.string()).default([]),
    location: Joi.string().optional(),
  }).required(),
  weights: Joi.object({
    skills: Joi.number().min(0).max(1).default(0.4),
    experience: Joi.number().min(0).max(1).default(0.3),
    education: Joi.number().min(0).max(1).default(0.2),
    relevance: Joi.number().min(0).max(1).default(0.1),
  }).optional(),
  status: Joi.string().valid('draft', 'active', 'closed').default('draft'),
  createdBy: Joi.string().optional(),
});

export const screeningOptionsSchema = Joi.object({
  jobId: Joi.string().required(),
  options: Joi.object({
    topN: Joi.number().min(1).max(100).default(20),
    minScore: Joi.number().min(0).max(100).default(0),
    weights: Joi.object({
      skills: Joi.number().min(0).max(1),
      experience: Joi.number().min(0).max(1),
      education: Joi.number().min(0).max(1),
      relevance: Joi.number().min(0).max(1),
    }).optional(),
  }).optional(),
});
